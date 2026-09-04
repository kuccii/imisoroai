import { auth } from '@/lib/auth'
import ImisoroApp from '@/components/imisoro-app'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login')
  return <ImisoroApp initialView="Overview" />
}
