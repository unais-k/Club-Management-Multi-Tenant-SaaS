import { BadgeCheck, Building2, Clock3, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { PageCard, PageTitle } from '@/components/admin-ui'
import { Button } from '@/components/ui/button'

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background px-4 py-3">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  )
}

export function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const isPlatformAdmin = user.role === 'PLATFORM_ADMIN'
  const roleName = isPlatformAdmin ? 'Platform administrator' : 'Club administrator'
  const pricingModel = user.club?.pricingModel === 'MEMBERSHIP_BASED' ? 'Membership based' : 'Shift based'

  async function signOut() {
    await logout().catch(() => undefined)
    navigate('/login', { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Account and workspace" description="Review the signed-in administrator and the workspace this account manages." />

      <div className="grid gap-5 lg:grid-cols-2">
        <PageCard>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/8 text-primary"><UserRound className="size-5" /></span>
            <div>
              <h3 className="text-sm font-semibold">Administrator profile</h3>
              <p className="mt-1 text-xs text-muted-foreground">Your current signed-in account</p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3">
            <Detail label="Name" value={user.name} />
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0"><dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Email</dt><dd className="mt-1 break-all text-sm font-medium">{user.email}</dd></div>
            </div>
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
              <div><dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Access role</dt><dd className="mt-1 text-sm font-medium">{roleName}</dd></div>
            </div>
          </dl>
        </PageCard>

        <PageCard>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/8 text-primary">{isPlatformAdmin ? <Building2 className="size-5" /> : <BadgeCheck className="size-5" />}</span>
            <div>
              <h3 className="text-sm font-semibold">{isPlatformAdmin ? 'Platform workspace' : 'Club workspace'}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Workspace context associated with this account</p>
            </div>
          </div>
          {isPlatformAdmin ? (
            <div className="mt-5 rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-medium">Platform administration</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">This account can manage clubs across the platform.</p>
              <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/clubs"><Building2 className="mr-2 size-4" />Manage clubs</Link></Button>
            </div>
          ) : (
            <dl className="mt-5 grid gap-3">
              <Detail label="Club" value={user.club?.name ?? 'Club details unavailable'} />
              <Detail label="Club slug" value={user.club?.slug ?? '—'} />
              <Detail label="Pricing model" value={user.club ? pricingModel : '—'} />
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                <Clock3 className="size-4 shrink-0 text-muted-foreground" />
                <div><dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Timezone</dt><dd className="mt-1 text-sm font-medium">{user.club?.timezone ?? '—'}</dd></div>
              </div>
            </dl>
          )}
        </PageCard>
      </div>

      <PageCard className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Session</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Sign out to end this administrator session on this browser.</p>
        </div>
        <Button variant="outline" onClick={() => void signOut()}><LogOut className="mr-2 size-4" />Sign out</Button>
      </PageCard>

      <p className="text-[11px] leading-5 text-muted-foreground">Profile and workspace details are read-only here. Editing administrator profiles and passwords is not currently available through the backend.</p>
    </div>
  )
}
