import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Busy, Empty, Field, inputClass, Notice, PageCard, PageTitle, selectClass } from '@/components/admin-ui'
import { apiRequest } from '@/lib/api'

type Location = { id: string; name: string }
type Court = { id: string; name: string }
type Booking = {
  id: string
  status: 'CONFIRMED' | 'CANCELLED'
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  price: number
  pricingModel: 'SHIFT_BASED' | 'MEMBERSHIP_BASED'
  membershipName: string | null
  court: { id: string; name: string | null }
  location: { id: string; name: string | null }
  user?: { id: string; name: string | null; email: string | null }
  canCancel: boolean
  cancelledAt: string | null
  createdAt: string
}
type BookingPage = { data: Booking[]; meta: { total: number; page: number; limit: number; totalPages: number } }
type LocationPage = { data: Location[] }
const PAGE_SIZE = 10
const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
const formatPrice = (value: number) => `¤${value.toFixed(2)}`

export function BookingsPage() {
  const [data, setData] = useState<BookingPage>({ data: [], meta: { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 } })
  const [locations, setLocations] = useState<Location[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [locationId, setLocationId] = useState('')
  const [courtId, setCourtId] = useState('')
  const [status, setStatus] = useState('')
  const [period, setPeriod] = useState('upcoming')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    apiRequest<LocationPage>('/locations?page=1&limit=100')
      .then((result) => { if (active) setLocations(result.data) })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load locations') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!locationId) { setCourts([]); setCourtId(''); return () => { active = false } }
    apiRequest<Court[]>(`/locations/${locationId}/courts`)
      .then((result) => { if (active) { setCourts(result); setCourtId((current) => result.some((court) => court.id === current) ? current : '') } })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load courts') })
    return () => { active = false }
  }, [locationId])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (status) query.set('status', status)
      if (period) query.set('period', period)
      if (locationId) query.set('locationId', locationId)
      if (courtId) query.set('courtId', courtId)
      if (dateFrom) query.set('dateFrom', dateFrom)
      if (dateTo) query.set('dateTo', dateTo)
      setData(await apiRequest<BookingPage>(`/bookings?${query.toString()}`))
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load bookings') }
    finally { setLoading(false) }
  }, [page, status, period, locationId, courtId, dateFrom, dateTo])

  useEffect(() => { void load() }, [load])

  async function cancelBooking(booking: Booking) {
    if (!window.confirm(`Cancel the booking at ${booking.startTime} on ${formatDate(booking.date)}?`)) return
    setBusyId(booking.id); setError(''); setNotice('')
    try {
      await apiRequest(`/bookings/${booking.id}/cancel`, { method: 'PATCH' })
      setNotice('Booking cancelled.')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel booking') }
    finally { setBusyId('') }
  }

  function resetFilters() {
    setStatus(''); setPeriod(''); setLocationId(''); setCourtId(''); setDateFrom(''); setDateTo(''); setPage(1)
  }

  return <div className="space-y-5">
    <PageTitle title="Bookings" description="Review club bookings, filter the schedule, and cancel bookings that have not started." action={<Button variant="outline" size="icon" aria-label="Refresh bookings" onClick={() => void load()}><RefreshCw className="size-4" /></Button>} />
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <PageCard><div className="mb-4 flex items-center gap-2"><Search className="size-4 text-primary" /><h3 className="text-xs font-semibold">Filters</h3><span className="ml-auto text-[10px] text-muted-foreground">{data.meta.total} results</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Field label="Period"><select className={selectClass} value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }}><option value="">Any date</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select></Field>
      <Field label="Status"><select className={selectClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="CONFIRMED">Confirmed</option><option value="CANCELLED">Cancelled</option></select></Field>
      <Field label="Location"><select className={selectClass} value={locationId} onChange={(event) => { setLocationId(event.target.value); setCourtId(''); setPage(1) }}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
      <Field label="Court"><select className={selectClass} value={courtId} disabled={!locationId} onChange={(event) => { setCourtId(event.target.value); setPage(1) }}><option value="">All courts</option>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></Field>
      <Field label="From date"><input type="date" className={inputClass} value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} /></Field>
      <Field label="To date"><input type="date" className={inputClass} value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} /></Field>
    </div><div className="mt-3 flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={resetFilters}><X className="size-3.5" />Clear filters</Button></div></PageCard>
    <PageCard className="p-0 sm:p-0"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-xs"><thead className="bg-muted/35 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Date / time</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Court</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-border">
      {!loading && data.data.map((booking) => <tr key={booking.id} className="align-top"><td className="px-4 py-4"><p className="font-medium">{formatDate(booking.date)}</p><p className="mt-1 text-[10px] text-muted-foreground">{booking.startTime}–{booking.endTime} · {booking.durationMinutes} min</p></td><td className="px-4 py-4"><p className="font-medium">{booking.user?.name ?? 'Customer'}</p><p className="mt-1 text-[10px] text-muted-foreground">{booking.user?.email ?? '—'}</p></td><td className="px-4 py-4"><p className="font-medium">{booking.court.name ?? 'Court removed'}</p><p className="mt-1 text-[10px] text-muted-foreground">{booking.location.name ?? 'Location removed'}</p></td><td className="px-4 py-4"><p className="font-medium">{formatPrice(booking.price)}</p><p className="mt-1 text-[10px] text-muted-foreground">{booking.pricingModel === 'MEMBERSHIP_BASED' ? booking.membershipName ?? 'Membership' : 'Shift pricing'}</p></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${booking.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{booking.status === 'CONFIRMED' ? 'Confirmed' : 'Cancelled'}</span></td><td className="px-4 py-4 text-right">{booking.canCancel && booking.status === 'CONFIRMED' ? <Button variant="destructive" size="sm" disabled={busyId === booking.id} onClick={() => void cancelBooking(booking)}>{busyId === booking.id ? 'Cancelling…' : 'Cancel booking'}</Button> : <span className="text-[10px] text-muted-foreground">—</span>}</td></tr>)}
      </tbody></table></div>
      {loading ? <div className="p-4"><Busy label="Loading bookings…" /></div> : data.data.length === 0 ? <div className="p-4"><Empty>No bookings match these filters.</Empty></div> : <div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="text-[10px] text-muted-foreground">Page {data.meta.page} of {Math.max(data.meta.totalPages, 1)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="size-3.5" />Previous</Button><Button variant="outline" size="sm" disabled={page >= data.meta.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="size-3.5" /></Button></div></div>}
    </PageCard>
  </div>
}
