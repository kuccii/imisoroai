import AdminPanel from '@/components/admin-panel'
import { getAdminAccess } from '@/lib/admin'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  let access: Awaited<ReturnType<typeof getAdminAccess>>
  try {
    access = await getAdminAccess()
  } catch (error) {
    console.error('[admin] page access check failed', error)
    access = { ok: false, reason: 'forbidden' }
  }

  if (!access.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7f3] px-5 text-[#10251f]">
        <div className="w-full max-w-md rounded-[24px] border border-[#dce9e1] bg-white p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#dff3e9] text-[#0f8062]"><ShieldCheck className="size-5" /></span>
          <h1 className="mt-5 text-xl font-bold tracking-[-0.03em]">Superadmin access required</h1>
          <p className="mt-3 text-sm leading-6 text-[#789087]">
            {access.reason === 'unauthenticated'
              ? 'Sign in with a superadmin account to open the platform console.'
              : 'This account does not have superadmin access. Ask an existing superadmin to promote it, or add the email to the SUPERADMIN_EMAILS environment variable.'}
          </p>
          <Link
            href={access.reason === 'unauthenticated' ? '/login' : '/dashboard'}
            className="mt-6 inline-flex rounded-xl bg-[#0f5c49] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#0a493a]"
          >
            {access.reason === 'unauthenticated' ? 'Sign in' : 'Back to workspace'}
          </Link>
        </div>
      </main>
    )
  }

  return <AdminPanel email={access.email} />
}
