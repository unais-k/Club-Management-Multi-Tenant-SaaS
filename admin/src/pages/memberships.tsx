import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BadgeCheck, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Busy, Empty, Field, inputClass, Notice, PageCard, PageTitle, textAreaClass } from '@/components/admin-ui'
import { apiRequest } from '@/lib/api'
import { useAuth } from '@/auth/auth-context'

type Price = { durationMinutes: number; price: number }
type Plan = { id: string; name: string; description: string | null; validityDays: number; isActive: boolean; prices: Price[]; missingDurations?: number[] }
type Location = { id: string; durations: number[] }
type Page<T> = { data: T[] }

export function MembershipsPage() {
  const { user } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [durations, setDurations] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDays, setNewDays] = useState('30')
  const [priceDrafts, setPriceDrafts] = useState<Record<string, Record<number, string>>>({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [planRows, locationRows] = await Promise.all([
        apiRequest<Plan[]>('/memberships'),
        apiRequest<Page<Location>>('/locations?page=1&limit=100'),
      ])
      const allDurations = [...new Set(locationRows.data.flatMap((location) => location.durations))].sort((a, b) => a - b)
      setDurations(allDurations); setPlans(planRows)
      setPriceDrafts(Object.fromEntries(planRows.map((plan) => [plan.id, Object.fromEntries(allDurations.map((duration) => [duration, plan.prices.find((item) => item.durationMinutes === duration)?.price.toString() ?? '']))])))
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load membership plans') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function createPlan(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest('/memberships', { method: 'POST', body: JSON.stringify({ name: newName, description: newDescription, validityDays: Number(newDays) }) })
      await load(); setCreateOpen(false); setNewName(''); setNewDescription(''); setNewDays('30'); setNotice('Membership plan created. Add prices before activating it for consumers.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create plan') }
    finally { setBusy(false) }
  }

  async function savePlan(plan: Plan) {
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await apiRequest<Plan>(`/memberships/${plan.id}`, { method: 'PUT', body: JSON.stringify({ name: plan.name, description: plan.description ?? '', validityDays: plan.validityDays, isActive: plan.isActive }) })
      setPlans((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); setNotice('Plan details saved.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update plan') }
    finally { setBusy(false) }
  }

  async function savePrices(plan: Plan) {
    setBusy(true); setError(''); setNotice('')
    try {
      const prices = durations.flatMap((durationMinutes) => {
        const value = priceDrafts[plan.id]?.[durationMinutes]?.trim()
        return value === undefined || value === '' ? [] : [{ durationMinutes, price: Number(value) }]
      })
      const updated = await apiRequest<Plan>(`/memberships/${plan.id}/prices`, { method: 'PUT', body: JSON.stringify({ prices }) })
      setPlans((items) => items.map((item) => item.id === updated.id ? updated : item)); setNotice(`Prices saved for ${plan.name}.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save prices') }
    finally { setBusy(false) }
  }

  async function toggleActive(plan: Plan) {
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await apiRequest<Plan>(`/memberships/${plan.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !plan.isActive }) })
      setPlans((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); setNotice(`${plan.name} is now ${updated.isActive ? 'active' : 'inactive'}.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not change plan status') }
    finally { setBusy(false) }
  }

  if (user?.club?.pricingModel !== 'MEMBERSHIP_BASED') return <div className="space-y-4"><PageTitle title="Membership plans" description="Plan management is available for membership-based clubs." /><Notice>This club uses shift-based pricing. Membership plans are not enabled for its current pricing model.</Notice></div>

  return <div className="space-y-5">
    <PageTitle title="Membership plans" description="Set plan duration and prices by booking length. Prices apply across the club’s locations." action={<div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Refresh plans" onClick={() => void load()}><RefreshCw className="size-4" /></Button><Button onClick={() => setCreateOpen((value) => !value)}><Plus className="size-4" />Create plan</Button></div>} />
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {createOpen && <PageCard><h3 className="mb-4 text-sm font-semibold">New membership plan</h3><form onSubmit={(event) => void createPlan(event)} className="grid gap-4 sm:grid-cols-2"><Field label="Plan name"><input required maxLength={100} className={inputClass} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Premium" /></Field><Field label="Validity (days)"><input required type="number" min={1} max={3650} className={inputClass} value={newDays} onChange={(event) => setNewDays(event.target.value)} /></Field><div className="sm:col-span-2"><Field label="Description"><textarea maxLength={1000} className={textAreaClass} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} /></Field></div><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : 'Create plan'}</Button></div></form></PageCard>}
    {loading ? <Busy label="Loading plans…" /> : plans.length === 0 ? <Empty>No membership plans yet. Create a plan to define member pricing.</Empty> : <div className="grid gap-4 xl:grid-cols-2">{plans.map((plan) => <PageCard key={plan.id} className="space-y-4">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary"><BadgeCheck className="size-5" /></span><div><h3 className="text-sm font-semibold">{plan.name}</h3><p className="mt-1 text-[10px] text-muted-foreground">{plan.validityDays} days · {plan.prices.length} duration prices</p></div></div><Button variant={plan.isActive ? 'outline' : 'secondary'} size="sm" disabled={busy} onClick={() => void toggleActive(plan)}>{plan.isActive ? 'Deactivate' : 'Activate'}</Button></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input className={inputClass} value={plan.name} onChange={(event) => setPlans((items) => items.map((item) => item.id === plan.id ? { ...item, name: event.target.value } : item))} /></Field><Field label="Validity (days)"><input type="number" min={1} max={3650} className={inputClass} value={plan.validityDays} onChange={(event) => setPlans((items) => items.map((item) => item.id === plan.id ? { ...item, validityDays: Number(event.target.value) } : item))} /></Field><div className="sm:col-span-2"><Field label="Description"><textarea className={textAreaClass} value={plan.description ?? ''} onChange={(event) => setPlans((items) => items.map((item) => item.id === plan.id ? { ...item, description: event.target.value } : item))} /></Field></div></div>
      <div className="flex justify-end"><Button variant="outline" size="sm" disabled={busy} onClick={() => void savePlan(plan)}>Save plan details</Button></div>
      <div className="rounded-xl border border-border p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h4 className="text-xs font-semibold">Price by booking duration</h4><p className="mt-1 text-[10px] text-muted-foreground">Blank prices are omitted when saved. At least one price is needed for consumers to see the plan.</p></div></div>{durations.length ? <div className="grid gap-3 sm:grid-cols-2">{durations.map((duration) => <Field key={duration} label={`${duration} minutes`}><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¤</span><input aria-label={`${plan.name} price for ${duration} minutes`} type="number" min={0} max={1000000} step="0.01" className={`${inputClass} pl-7`} value={priceDrafts[plan.id]?.[duration] ?? ''} onChange={(event) => setPriceDrafts((all) => ({ ...all, [plan.id]: { ...all[plan.id], [duration]: event.target.value } }))} placeholder="0.00" /></div></Field>)}</div> : <p className="text-xs text-muted-foreground">Add booking durations to a location before setting plan prices.</p>}<div className="mt-4 flex justify-end"><Button size="sm" disabled={busy || !durations.length} onClick={() => void savePrices(plan)}>Save prices</Button></div></div>
      {plan.missingDurations?.length ? <p className="text-[10px] text-amber-700">Missing prices: {plan.missingDurations.join(', ')} minutes</p> : null}
    </PageCard>)}</div>}
  </div>
}
