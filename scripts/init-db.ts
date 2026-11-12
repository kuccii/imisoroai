import { ensureDatabaseSchema } from '../lib/db/bootstrap'
import { pool } from '../lib/db'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and start a database first (pnpm dev:db).')
    process.exitCode = 1
    return
  }

  await ensureDatabaseSchema()
  const { rows } = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  )
  console.log(`Schema ready. ${rows.length} tables:`)
  for (const row of rows) console.log(`  - ${row.table_name}`)
}

main()
  .catch((error) => {
    console.error('Database initialization failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
