import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Busy, Empty, Field, inputClass, Notice, PageCard, PageTitle, selectClass, textAreaClass } from '@/components/admin-ui'
import { apiRequest } from '@/lib/api'

type Hours = { dayOfWeek: number; openTime: string; closeTime: string }
type Closure = { id: string; date: string; startTime: string; endTime: string; durationMinutes: number; reason: string | null }
type Location = { id: string; name: string; address: string; details: string | null; durations: number[]; isActive: boolean; openingHours: Hours[] }
type Page<T> = { data: T[]; meta: { total: number } }
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const durationsFrom = (value: string) => [...new Set(value.split(',').map((part) => Number(part.trim())).filter((number) => Number.isInteger(number) && number >= 5 && number <= 480))].sort((a, b) => a - b)

export function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [details, setDetails] = useState('')
  const [durations, setDurations] = useState('60, 90')
  const [hours, setHours] = useState<Hours[]>([])
  const [periods, setPeriods] = useState<Closure[]>([])
  const [closureDate, setClosureDate] = useState(new Date().toISOString().slice(0, 10))
  const [closureStart, setClosureStart] = useState('12:00')
  const [closureEnd, setClosureEnd] = useState('13:00')
  const [closureReason, setClosureReason] = useState('')

  const selected = locations.find((location) => location.id === selectedId) ?? locations[0]
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await apiRequest<Page<Location>>('/locations?page=1&limit=100')
      setLocations(result.data); setSelectedId((previous) => result.data.some((item) => item.id === previous) ? previous : result.data[0]?.id ?? '')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load locations') }
    finally { setLoading(false) }
  }, [])

  const loadPeriods = useCallback(async (id: string) => {
    try { setPeriods(await apiRequest<Closure[]>(`/locations/${id}/unavailable-periods`)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load unavailable periods') }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selected) return
    setHours(selected.openingHours)
    void loadPeriods(selected.id)
  }, [selectedId, locations, selected, loadPeriods])

  async function createLocation(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const created = await apiRequest<Location>('/locations', { method: 'POST', body: JSON.stringify({ name, address, details, durations: durationsFrom(durations) }) })
      await load(); setSelectedId(created.id); setShowCreate(false); setName(''); setAddress(''); setDetails(''); setNotice('Location created. Set its opening hours to make it available.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create location') }
    finally { setBusy(false) }
  }

  async function saveLocation(event: FormEvent) {
    event.preventDefault(); if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await apiRequest<Location>(`/locations/${selected.id}`, { method: 'PUT', body: JSON.stringify({ name: selected.name, address: selected.address, details: selected.details ?? '', durations: selected.durations, isActive: selected.isActive }) })
      setLocations((items) => items.map((item) => item.id === updated.id ? updated : item)); setNotice('Location details saved.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update location') }
    finally { setBusy(false) }
  }

  async function saveHours(event: FormEvent) {
    event.preventDefault(); if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      const openingHours = hours.map(({ dayOfWeek, openTime, closeTime }) => ({ dayOfWeek, openTime, closeTime }))
      const updated = await apiRequest<Location>(`/locations/${selected.id}/opening-hours`, { method: 'PUT', body: JSON.stringify({ openingHours }) })
      setLocations((items) => items.map((item) => item.id === updated.id ? updated : item)); setNotice('Weekly opening hours saved.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save opening hours') }
    finally { setBusy(false) }
  }

  async function addClosure(event: FormEvent) {
    event.preventDefault(); if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest(`/locations/${selected.id}/unavailable-periods`, { method: 'POST', body: JSON.stringify({ date: closureDate, startTime: closureStart, endTime: closureEnd, reason: closureReason || undefined }) })
      await loadPeriods(selected.id); setClosureReason(''); setNotice('Unavailable period added.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add unavailable period') }
    finally { setBusy(false) }
  }

  async function removeClosure(id: string) {
    if (!selected) return
    setBusy(true); setError('')
    try { await apiRequest(`/locations/${selected.id}/unavailable-periods/${id}`, { method: 'DELETE' }); await loadPeriods(selected.id); setNotice('Unavailable period removed.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not remove unavailable period') }
    finally { setBusy(false) }
  }

  const dayNames = useMemo(() => days, [])

  return <div className="space-y-5">
    <PageTitle title="Locations" description="Manage your club’s locations, operating hours, and one-off closures." action={<div className="flex gap-2"><Button variant="outline" onClick={() => void load()} aria-label="Refresh locations"><RefreshCw className="size-4" /></Button><Button onClick={() => setShowCreate((value) => !value)}><Plus className="size-4" />Add location</Button></div>} />
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {showCreate && <PageCard><h3 className="mb-4 text-sm font-semibold">New location</h3><form onSubmit={(event) => void createLocation(event)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Location name"><input required maxLength={150} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Downtown Sports Center" /></Field>
      <Field label="Address"><input required maxLength={255} className={inputClass} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street address" /></Field>
      <Field label="Booking durations (minutes)" hint="Comma separated, for example 30, 60, 90"><input required className={inputClass} value={durations} onChange={(event) => setDurations(event.target.value)} /></Field>
      <Field label="Details"><input className={inputClass} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Optional notes" /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button><Button disabled={busy || durationsFrom(durations).length === 0}>{busy ? 'Saving…' : 'Create location'}</Button></div>
    </form></PageCard>}
    {loading ? <Busy label="Loading locations…" /> : locations.length === 0 ? <Empty>No locations yet. Add the first location to start configuring the club.</Empty> : <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <PageCard className="h-fit p-3"><div className="mb-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your locations</div><div className="space-y-1">{locations.map((location) => <button key={location.id} onClick={() => { setSelectedId(location.id); setNotice(''); setError('') }} className={`w-full rounded-lg px-3 py-3 text-left transition ${selected?.id === location.id ? 'bg-primary/8 text-primary' : 'hover:bg-muted'}`}><span className="flex items-center gap-2 text-xs font-semibold"><MapPin className="size-3.5" />{location.name}</span><span className="mt-1 block pl-5 text-[10px] text-muted-foreground">{location.durations.join(' · ')} min · {location.isActive ? 'Active' : 'Inactive'}</span></button>)}</div></PageCard>
      {selected && <div className="space-y-5">
        <PageCard><PageTitle title="Location details" description="Details and booking durations offered at this location." /><form onSubmit={(event) => void saveLocation(event)} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input required className={inputClass} value={selected.name} onChange={(event) => setLocations((items) => items.map((item) => item.id === selected.id ? { ...item, name: event.target.value } : item))} /></Field>
          <Field label="Address"><input required className={inputClass} value={selected.address} onChange={(event) => setLocations((items) => items.map((item) => item.id === selected.id ? { ...item, address: event.target.value } : item))} /></Field>
          <Field label="Durations (minutes)" hint="Changing durations may be blocked while courts use the removed durations."><input required className={inputClass} value={selected.durations.join(', ')} onChange={(event) => { const values = durationsFrom(event.target.value); setLocations((items) => items.map((item) => item.id === selected.id ? { ...item, durations: values } : item)) }} /></Field>
          <Field label="Status"><select className={selectClass} value={String(selected.isActive)} onChange={(event) => setLocations((items) => items.map((item) => item.id === selected.id ? { ...item, isActive: event.target.value === 'true' } : item))}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
          <div className="sm:col-span-2"><Field label="Details"><textarea className={textAreaClass} value={selected.details ?? ''} onChange={(event) => setLocations((items) => items.map((item) => item.id === selected.id ? { ...item, details: event.target.value } : item))} /></Field></div>
          <div className="flex justify-end sm:col-span-2"><Button disabled={busy}>{busy ? 'Saving…' : 'Save details'}</Button></div>
        </form></PageCard>
        <PageCard><PageTitle title="Weekly opening hours" description={`Add one or more opening windows per day. Every offered duration (${selected.durations.join(', ')} min) needs at least one bookable slot each week. Days without a window are closed.`} action={<CalendarClock className="size-5 text-primary" />} /><form onSubmit={(event) => void saveHours(event)} className="space-y-3">
          {dayNames.map((dayName, dayOfWeek) => <div key={dayOfWeek} className="rounded-lg bg-muted/35 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold">{dayName}</span><Button type="button" size="sm" variant="ghost" onClick={() => setHours((items) => [...items, { dayOfWeek, openTime: '08:00', closeTime: '22:00' }])}><Plus className="size-3.5" />Add window</Button></div><div className="space-y-2">{hours.filter((row) => row.dayOfWeek === dayOfWeek).map((row) => <div key={`${row.dayOfWeek}-${row.openTime}-${row.closeTime}-${hours.indexOf(row)}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"><input aria-label={`${dayName} opening time`} type="time" className={inputClass} value={row.openTime} onChange={(event) => setHours((items) => items.map((item, index) => index === hours.indexOf(row) ? { ...item, openTime: event.target.value } : item))} /><input aria-label={`${dayName} closing time`} type="time" className={inputClass} value={row.closeTime} onChange={(event) => setHours((items) => items.map((item, index) => index === hours.indexOf(row) ? { ...item, closeTime: event.target.value } : item))} /><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${dayName} window`} onClick={() => setHours((items) => items.filter((_, index) => index !== hours.indexOf(row)))}><Trash2 className="size-4 text-muted-foreground" /></Button></div>)}{hours.filter((row) => row.dayOfWeek === dayOfWeek).length === 0 && <p className="text-[10px] text-muted-foreground">Closed</p>}</div></div>)}
          <div className="flex justify-end pt-2"><Button disabled={busy}>{busy ? 'Saving…' : 'Save weekly hours'}</Button></div>
        </form></PageCard>
        <PageCard><PageTitle title="Unavailable periods" description="Add one-off closures or maintenance windows for a date." /><form onSubmit={(event) => void addClosure(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Date"><input required type="date" className={inputClass} value={closureDate} onChange={(event) => setClosureDate(event.target.value)} /></Field><Field label="From"><input required type="time" className={inputClass} value={closureStart} onChange={(event) => setClosureStart(event.target.value)} /></Field><Field label="Until"><input required type="time" className={inputClass} value={closureEnd} onChange={(event) => setClosureEnd(event.target.value)} /></Field><Field label="Reason"><input className={inputClass} value={closureReason} onChange={(event) => setClosureReason(event.target.value)} placeholder="Maintenance" /></Field><div className="flex items-end"><Button disabled={busy} className="w-full"><Plus className="size-4" />Add closure</Button></div>
        </form><div className="mt-4 space-y-2">{periods.length ? periods.map((period) => <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-3"><div><p className="text-xs font-semibold">{period.date} · {period.startTime}–{period.endTime}</p><p className="mt-1 text-[10px] text-muted-foreground">{period.reason || 'Unavailable'} · {period.durationMinutes} minutes</p></div><Button type="button" variant="ghost" size="icon" aria-label="Remove unavailable period" disabled={busy} onClick={() => void removeClosure(period.id)}><Trash2 className="size-4 text-destructive" /></Button></div>) : <p className="py-4 text-center text-xs text-muted-foreground">No unavailable periods configured.</p>}</div></PageCard>
      </div>}
    </div>}
  </div>
}
