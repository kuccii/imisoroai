import { getAdminAccess } from '@/lib/admin'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const access = await getAdminAccess()
    return NextResponse.json({ superadmin: access.ok, email: access.ok ? access.email : null })
  } catch (error) {
    console.error('[admin] access check failed', error)
    return NextResponse.json({ superadmin: false, email: null })
  }
}
