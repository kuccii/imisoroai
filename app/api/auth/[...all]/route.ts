import { auth } from '@/lib/auth'
import { ensureDatabaseSchema } from '@/lib/db/bootstrap'
import { toNextJsHandler } from 'better-auth/next-js'

const handler = toNextJsHandler(auth)

async function prepare() {
  await ensureDatabaseSchema().catch((error) => {
    console.error('[db] schema bootstrap failed', error)
  })
}

export async function GET(request: Request) {
  await prepare()
  return handler.GET(request)
}

export async function POST(request: Request) {
  await prepare()
  return handler.POST(request)
}
