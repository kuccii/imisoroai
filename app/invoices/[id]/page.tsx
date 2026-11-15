import WorkspaceRoute from '@/components/workspace-route'

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WorkspaceRoute initialView="Invoices" initialInvoiceId={id} />
}
