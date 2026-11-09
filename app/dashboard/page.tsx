import ImisoroApp from '@/components/imisoro-app'
import { getWorkspaceData } from '@/lib/data'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const workspace = await getWorkspaceData()
  if (!workspace) redirect('/login')
  return <ImisoroApp initialView="Overview" initialSession={workspace.session} initialInvoices={workspace.invoices} />
}
