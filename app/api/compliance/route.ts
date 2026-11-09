import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvent, complianceTask } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

function nextMonthDeadline() {
  const date = new Date()
  date.setMonth(date.getMonth() + 1, 10)
  return date.toISOString().slice(0, 10)
}

export async function GET() {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let tasks = await db.select().from(complianceTask).where(eq(complianceTask.userId, id))
  if (tasks.length === 0) {
    const [task] = await db.insert(complianceTask).values({ id: `TAX-${Date.now().toString(36).toUpperCase()}`, userId: id, title: 'Review monthly VAT return', description: 'Review supported purchase invoices and submit your monthly VAT return before the due date.', dueDate: nextMonthDeadline() }).returning()
    tasks = [task]
  }
  return NextResponse.json({ tasks })
}

export async function PATCH(request: Request) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json() as { taskId?: string; status?: string }
  if (!body.taskId || !['open', 'completed'].includes(body.status || '')) return NextResponse.json({ error: 'Invalid task update.' }, { status: 400 })
  const [task] = await db.update(complianceTask).set({ status: body.status, updatedAt: new Date() }).where(and(eq(complianceTask.id, body.taskId), eq(complianceTask.userId, id))).returning()
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  await db.insert(auditEvent).values({ id: `AUD-${Date.now().toString(36).toUpperCase()}`, userId: id, action: body.status === 'completed' ? 'compliance_task_completed' : 'compliance_task_reopened', entityType: 'compliance_task', entityId: task.id })
  return NextResponse.json({ task })
}
