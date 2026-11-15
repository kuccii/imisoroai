import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDirectory = path.resolve(projectRoot, process.argv[2] ?? 'tests/fixtures/receipt-accuracy')
const fields = ['supplier', 'tin', 'invoiceDate', 'invoiceNumber', 'amount', 'vat', 'currency', 'evidence']

const annotationFiles = (await readdir(fixtureDirectory)).filter((filename) => filename.endsWith('.json')).sort()
if (annotationFiles.length === 0) throw new Error(`No JSON annotations found in ${fixtureDirectory}`)

const results = Object.fromEntries(fields.map((field) => [field, { correct: 0, tested: 0 }]))
let syntheticFixtures = 0
let redactedFixtures = 0

for (const filename of annotationFiles) {
  const annotation = JSON.parse(await readFile(path.join(fixtureDirectory, filename), 'utf8'))
  if (typeof annotation.receiptFile !== 'string' || !annotation.groundTruth || !annotation.prediction) {
    throw new Error(`${filename} must include receiptFile, groundTruth, and prediction.`)
  }
  await access(path.join(fixtureDirectory, annotation.receiptFile))
  if (annotation.synthetic === true) syntheticFixtures += 1
  else redactedFixtures += 1

  for (const field of fields) {
    const expected = annotation.groundTruth[field]
    if (expected === undefined || expected === null) continue
    const predicted = annotation.prediction[field]
    const normalize = (value) => String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
    results[field].tested += 1
    if (predicted !== undefined && predicted !== null && normalize(predicted) === normalize(expected)) {
      results[field].correct += 1
    }
  }
}

const report = Object.fromEntries(Object.entries(results).map(([field, result]) => [field, {
  ...result,
  accuracy: result.tested === 0 ? null : result.correct / result.tested,
}]))
console.log(JSON.stringify({
  fixtures: annotationFiles.length,
  redactedFixtures,
  syntheticFixtures,
  productionAccuracyClaimAllowed: redactedFixtures > 0,
  perField: report,
}, null, 2))
if (redactedFixtures === 0) console.log('No redacted receipt corpus was scored. Synthetic results are harness checks only, not an accuracy claim.')
