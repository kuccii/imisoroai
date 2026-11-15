import WorkspaceRoute from '@/components/workspace-route'
import type { View } from '@/components/imisoro-app'

const dashboardViews: Record<string, View> = {
  'filing-preparation': 'Filing preparation',
  fiscalization: 'Fiscalization',
  sales: 'Sales',
  reconciliation: 'Reconciliation',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  return <WorkspaceRoute initialView={dashboardViews[view ?? ''] ?? 'Overview'} />
}
