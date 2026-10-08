import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Building2, Coins, Grid2X2, MapPin, RefreshCw } from 'lucide-react'
import { useAuth } from '@/auth/auth-context'
import { PageCard, PageTitle, Busy, Notice } from '@/components/admin-ui'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/api'

type Page<T> = { data: T[]; meta: { total: number; totalPages: number } }
type Tenant = { id: string; name: string; isActive: boolean; pricingModel: string }
type Location = { id: string; name: string; isActive: boolean; openingHours: Array<{ dayOfWeek: number }> }
type Court = { id: string; isActive: boolean }
type Membership = { id: string; isActive: boolean; prices: Array<{ durationMinutes: number }> }
const metricIcons = [MapPin, Grid2X2, BadgeCheck]

export function OverviewPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [metrics, setMetrics] = useState<Array<{ label: string; value: number; detail: string }>>([])
  const [rows, setRows] = useState<Array<{ name: string; detail: string; active: boolean }>>([])
  const isPlatform = user?.role === 'PLATFORM_ADMIN'

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (isPlatform) {
        const result = await apiRequest<Page<Tenant>>('/tenants?page=1&limit=100')
        const active = result.data.filter((tenant) => tenant.isActive).length
        setMetrics([{ label: 'Total clubs', value: result.meta.total, detail: `${active} active` }, { label: 'Shift based', value: result.data.filter((tenant) => tenant.pricingModel === 'SHIFT_BASED').length, detail: 'Current page' }, { label: 'Membership based', value: result.data.filter((tenant) => tenant.pricingModel === 'MEMBERSHIP_BASED').length, detail: 'Current page' }])
        setRows(result.data.slice(0, 8).map((tenant) => ({ name: tenant.name, detail: tenant.pricingModel === 'SHIFT_BASED' ? 'Shift based pricing' : 'Membership based pricing', active: tenant.isActive })))
      } else {
        const locationResult = await apiRequest<Page<Location>>('/locations?page=1&limit=100')
        const locationRows = locationResult.data
        const courtRows = await Promise.all(locationRows.map((location) => apiRequest<Court[]>(`/locations/${location.id}/courts`)))
        const courts = courtRows.flat()
        const memberships = user?.club?.pricingModel === 'MEMBERSHIP_BASED' ? await apiRequest<Membership[]>('/memberships') : []
        setMetrics([
          { label: 'Locations', value: locationRows.length, detail: `${locationRows.filter((item) => item.isActive).length} active` },
          { label: 'Courts', value: courts.length, detail: `${courts.filter((item) => item.isActive).length} active` },
          { label: 'Membership plans', value: memberships.length, detail: `${memberships.filter((item) => item.isActive && item.prices.length > 0).length} active and priced` },
        ])
        setRows(locationRows.slice(0, 8).map((location) => ({ name: location.name, detail: `${location.openingHours.length} weekly opening windows`, active: location.isActive })))
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load overview') }
    finally { setLoading(false) }
  }, [isPlatform, user?.club?.pricingModel])

  useEffect(() => { void load() }, [load])

  return <div className="space-y-5">
    <PageTitle title="Overview" description={isPlatform ? 'A quick view of clubs registered on your platform.' : 'A quick view of your club’s setup and active resources.'} action={<Button variant="outline" size="icon" aria-label="Refresh overview" onClick={() => void load()}><RefreshCw className="size-4" /></Button>} />
    {error && <Notice error>{error}</Notice>}
    {loading ? <Busy label="Loading overview…" /> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map((metric, index) => { const Icon = isPlatform ? [Building2, Coins, BadgeCheck][index] : metricIcons[index]; return <PageCard key={metric.label} className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">{metric.label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</p><p className="mt-1 text-[10px] text-muted-foreground">{metric.detail}</p></div><span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary"><Icon className="size-5" /></span></PageCard>})}</div>
      <PageCard><div className="mb-4 flex items-start justify-between"><div><h3 className="text-sm font-semibold">{isPlatform ? 'Recently listed clubs' : 'Your locations'}</h3><p className="mt-1 text-[11px] text-muted-foreground">{isPlatform ? 'First page of platform clubs.' : 'Opening-window counts are from the weekly schedule. Booking conflicts are not included.'}</p></div></div>{rows.length ? <div className="divide-y divide-border">{rows.map((row) => <div key={row.name} className="flex items-center justify-between gap-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><MapPin className="size-4 text-muted-foreground" /></span><div className="min-w-0"><p className="truncate text-xs font-medium">{row.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.detail}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${row.active ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{row.active ? 'Active' : 'Inactive'}</span></div>)}</div> : <div className="py-10 text-center text-xs text-muted-foreground">No records to show yet.</div>}</PageCard>
      <p className="text-[10px] text-muted-foreground">Use Bookings to review confirmed or cancelled reservations, and Availability to check open slots with booking conflicts excluded.</p>
    </>}
  </div>
}
