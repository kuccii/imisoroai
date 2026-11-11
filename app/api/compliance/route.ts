import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, complianceTask } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function GET() {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const storedTasks = await db.select().from(complianceTask).where(eq(complianceTask.userId, id))
  const tasks = storedTasks.filter((task) => task.source !== 'rwanda_tax_calendar')
  return NextResponse.json({
    tasks,
    deadlineNotice: 'Official filing due dates are not configured. Verify the period and deadline in RRA eTax before acting.',
  })
}

const createSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(4).max(500),
  dueDate: z.string().date(),
})

const updateSchema = z.object({ taskId: z.string().min(1).max(200), status: z.enum(['open', 'completed']) })

export async function POST(request: Request) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter a title, description, and date.' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid reminder.' }, { status: 400 })

  const task = await db.transaction(async (tx) => {
    const taskId = `TAX-${crypto.randomUUID()}`
    const [created] = await tx.insert(complianceTask).values({ ...parsed.data, id: taskId, userId: id, source: 'manual', status: 'open' }).returning()
    await tx.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: id, action: 'manual_compliance_task_created', entityType: 'compliance_task', entityId: taskId, metadata: JSON.stringify({ dueDateSource: 'user_entered' }) })
    return created
  })
  return NextResponse.json({ task }, { status: 201 })
}

export async function PATCH(request: Request) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid task update.' }, { status: 400 })
  }
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid task update.' }, { status: 400 })

  const result = await db.transaction(async (tx) => {
    const [task] = await tx.update(complianceTask).set({ status: parsed.data.status, updatedAt: new Date() }).where(and(
      eq(complianceTask.id, parsed.data.taskId),
      eq(complianceTask.userId, id),
      eq(complianceTask.source, 'manual'),
    )).returning()
    if (!task) return null

    await tx.insert(auditEvent).values({
      id: `AUD-${crypto.randomUUID()}`,
      userId: id,
      action: parsed.data.status === 'completed' ? 'compliance_task_completed' : 'compliance_task_reopened',
      entityType: 'compliance_task',
      entityId: task.id,
      metadata: JSON.stringify({ source: task.source }),
    })
    return task
  })

  if (!result) return NextResponse.json({ error: 'User-created task not found.' }, { status: 404 })
  return NextResponse.json({ task: result })
}
