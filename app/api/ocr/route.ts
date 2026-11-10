import { put } from '@vercel/blob'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceRecord } from '@/lib/db/schema'
import { generateObject } from 'ai'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60

const invoiceSchema = z.object({
  supplier: z.string().describe('Supplier or seller name exactly as printed.'),
  tin: z.string().describe('Supplier TIN or PENDING if unreadable.'),
  invoiceDate: z.string().describe('Invoice date in YYYY-MM-DD format, or UNKNOWN if unreadable.'),
  invoiceNumber: z.string().describe('Invoice or EBM number, or UNKNOWN if unreadable.'),
  amount: z.number().nonnegative().describe('Total invoice amount in Rwandan francs.'),
  vat: z.number().nonnegative().describe('VAT amount in Rwandan francs.'),
  currency: z.string().describe('Currency code, usually RWF.'),
  confidence: z.number().min(0).max(1),
  evidence: z.enum(['ebm_present', 'ebm_missing', 'unclear']),
  notes: z.array(z.string()).max(8),
})

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Attach a PDF, JPG, or PNG invoice.' }, { status: 400 })
  if (file.size === 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Files must be between 1 byte and 10MB.' }, { status: 400 })
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return NextResponse.json({ error: 'Only PDF, JPG, and PNG invoices are supported.' }, { status: 415 })

  const id = `INV-${Date.now().toString(36).toUpperCase()}`
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120)
  const blob = await put(`invoices/${session.user.id}/${id}-${safeName}`, file, { access: 'private', addRandomSuffix: false, contentType: file.type })
  const bytes = Buffer.from(await file.arrayBuffer())
  const mediaType = file.type as 'application/pdf' | 'image/jpeg' | 'image/png'
  const { object } = await generateObject({
    model: 'openai/gpt-5.4-mini',
    schema: invoiceSchema,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Extract this Rwanda invoice carefully. Never invent values. Use UNKNOWN or PENDING when text is not legible. Identify whether an EBM/VSDC fiscal signature, QR code, or EBM number is visibly present. All amounts must be numeric RWF values. This extraction is advisory and must be reviewed before filing.' },
        { type: 'file', data: bytes, mediaType },
      ],
    }],
  })

  const status = object.confidence >= 0.86 && object.evidence === 'ebm_present' ? 'supported' : object.evidence === 'ebm_missing' ? 'unsupported' : 'pending'
  const [invoice] = await db.insert(invoiceRecord).values({
    id,
    userId: session.user.id,
    supplier: object.supplier || 'Unknown supplier',
    tin: object.tin || 'PENDING',
    invoiceDate: object.invoiceDate,
    amount: Math.round(object.amount),
    vat: Math.round(object.vat),
    status,
    blobPathname: blob.pathname,
    originalFilename: file.name,
    contentType: file.type,
  }).returning()

  return NextResponse.json({ invoice, extraction: object, requiresReview: status === 'pending' })
}
