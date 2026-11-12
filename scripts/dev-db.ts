import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { mkdir } from 'node:fs/promises'

const dataDir = process.env.PGLITE_DATA_DIR ?? '.data/pglite'
const port = Number(process.env.PGLITE_PORT ?? '5432')
const host = process.env.PGLITE_HOST ?? '127.0.0.1'

async function main() {
  await mkdir(dataDir, { recursive: true })
  const db = await PGlite.create(dataDir)
  const server = new PGLiteSocketServer({ db, port, host, maxConnections: 10 })
  await server.start()

  console.log(`[dev-db] PGlite ready at postgresql://postgres:postgres@${host}:${port}/postgres`)
  console.log(`[dev-db] data directory: ${dataDir}`)

  const shutdown = async () => {
    console.log('[dev-db] shutting down')
    await server.stop().catch(() => undefined)
    await db.close().catch(() => undefined)
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('[dev-db] failed to start', error)
  process.exit(1)
})
