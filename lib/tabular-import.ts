import ExcelJS from 'exceljs'

export type TabularData = { headers: string[]; rows: string[][] }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(values => values.some(value => value.trim().length > 0))
}

function cellText(value: ExcelJS.CellValue): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value && typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return String(value.result ?? '')
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map(part => part.text).join('')
  }
  return value == null ? '' : String(value)
}

export async function parseTabularFile(file: File): Promise<TabularData> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  let rows: string[][]
  if (ext === 'csv' || ext === 'txt') {
    rows = parseCsv(await file.text())
  } else if (ext === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new Error('The workbook has no worksheet.')
    rows = []
    sheet.eachRow({ includeEmpty: false }, row => {
      const values: string[] = []
      for (let column = 1; column <= sheet.columnCount; column += 1) values.push(cellText(row.getCell(column).value))
      rows.push(values)
    })
  } else {
    throw new Error('Choose a CSV or XLSX file, or paste a table.')
  }
  if (rows.length < 2) throw new Error('Include a header row and at least one data row.')
  const headers = rows[0].map((header, index) => header.trim() || `Column ${index + 1}`)
  return { headers, rows: rows.slice(1).map(row => headers.map((_, index) => row[index] ?? '')) }
}

export function parsePastedTable(text: string): TabularData {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) throw new Error('Paste a table with a header row.')
  const rows = lines.map(line => line.includes('\t') ? line.split('\t').map(value => value.trim()) : (parseCsv(line)[0] ?? []))
  if (rows.length < 2) throw new Error('Include a header row and at least one data row.')
  const headers = rows[0].map((header, index) => header.trim() || `Column ${index + 1}`)
  return { headers, rows: rows.slice(1).map(row => headers.map((_, index) => row[index] ?? '')) }
}
