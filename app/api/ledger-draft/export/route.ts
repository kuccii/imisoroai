import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth'
import { getClientContext } from '@/lib/client-workspace'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { db } from '@/lib/db'
import { auditEvent, ledgerDraftEntry } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDatabaseSchema()
  const params = new URL(request.url).searchParams
  const client = await getClientContext(session.user, params.get('clientId'))
  if (!client) return NextResponse.json({ error: 'Client not found or access not granted.' }, { status: 404 })
  if (!client.consentActive) return NextResponse.json({ error: 'Client consent is not active.' }, { status: 409 })
  const entries = await db.select().from(ledgerDraftEntry).where(eq(ledgerDraftEntry.clientId, client.id)).orderBy(asc(ledgerDraftEntry.expenseDate)).limit(5000)
  const format = params.get('format') === 'xlsx' ? 'xlsx' : 'csv'
  await db.insert(auditEvent).values({ id: `AUD-${crypto.randomUUID()}`, userId: session.user.id, clientId: client.id, action: 'ledger_draft_exported', entityType: 'ledger_draft_entry', metadata: JSON.stringify({ format, rowCount: entries.length }) })
  const headersRow = ['Date', 'Supplier', 'Supplier TIN', 'Receipt / reference', 'Amount RWF', 'Reason', 'Evidence description', 'Internal review status']
  const rows = entries.map(entry => [entry.expenseDate, entry.supplier, entry.tin, entry.reference, entry.amountRwf, entry.reason, entry.evidenceDescription, entry.reviewStatus])
  const filename = `imisoro-ledger-draft-${client.id}`
  if (params.get('format') === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Imisoro AI'
    const sheet = workbook.addWorksheet('Ledger draft')
    sheet.columns = headersRow.map((_, index) => ({ key: String(index), width: [12, 24, 18, 20, 16, 34, 34, 20][index] }))
    sheet.mergeCells('A1:H1')
    sheet.getCell('A1').value = 'NOT UPLOAD-READY — RRA annexure format not verified (VERIFY-02). Internal review draft only; no deductibility or tax determination.'
    sheet.getCell('A1').font = { bold: true, color: { argb: 'FF8A3D24' } }
    sheet.addRow(headersRow)
    sheet.getRow(2).font = { bold: true }
    rows.forEach(row => sheet.addRow(row))
    const buffer = await workbook.xlsx.writeBuffer()
    return new Response(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}.xlsx"`, 'X-Content-Type-Options': 'nosniff' } })
  }
  const lines = [
    ['# NOT UPLOAD-READY: RRA annexure format not verified (VERIFY-02). Internal review draft only.'],
    headersRow,
    ...rows,
  ]
  const csv = lines.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  return new Response(`\uFEFF${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.csv"`, 'X-Content-Type-Options': 'nosniff' } })
}
