import { notFound, redirect } from 'next/navigation'
import ImisoroApp, { type View } from '@/components/imisoro-app'
import { getWorkspaceData } from '@/lib/data'

export default async function WorkspaceRoute({
  initialView,
  initialInvoiceId,
}: {
  initialView: View
  initialInvoiceId?: string
}) {
  const workspace = await getWorkspaceData()
  if (!workspace) redirect('/login')

  if (initialInvoiceId && !workspace.invoices.some((invoice) => invoice.id === initialInvoiceId)) {
    notFound()
  }

  const language = workspace.profile?.language === 'rw' || workspace.profile?.language === 'fr'
    ? workspace.profile.language
    : 'en'

  return (
    <ImisoroApp
      key={`${initialView}:${initialInvoiceId ?? ''}`}
      initialView={initialView}
      initialInvoiceId={initialInvoiceId}
      initialSession={workspace.session}
      initialInvoices={workspace.invoices}
      initialLanguage={language}
    />
  )
}
