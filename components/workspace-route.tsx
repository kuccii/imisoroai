import { notFound, redirect } from 'next/navigation'
import type { View } from '@/components/imisoro-app'
import { MissingFirstWorkspace } from '@/components/missing-first-workspace'
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
    <MissingFirstWorkspace
      key={`${initialView}:${initialInvoiceId ?? ''}`}
      userName={workspace.session.user.name || workspace.session.user.email?.split('@')[0] || 'there'}
      initialLanguage={language}
    />
  )
}
