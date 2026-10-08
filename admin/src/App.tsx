import { useState } from 'react'
import {
  CalendarDays,
  Clock3,
  Building2,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  BadgeCheck,
  MapPin,
  Menu,
  Coins,
  Settings2,
  X,
} from 'lucide-react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/auth-context'
import { LoginPage } from '@/pages/login'
import { ClubsPage } from '@/pages/clubs'
import { LocationsPage } from '@/pages/locations'
import { CourtsPage } from '@/pages/courts'
import { PricingPage } from '@/pages/pricing'
import { MembershipsPage } from '@/pages/memberships'
import { OverviewPage } from '@/pages/overview'
import { BookingsPage } from '@/pages/bookings'
import { AvailabilityPage } from '@/pages/availability'
import { SettingsPage } from '@/pages/settings'

const navigation = [
  { label: 'Overview', path: '/overview', icon: LayoutDashboard },
  { label: 'Clubs', path: '/clubs', icon: Building2, role: 'PLATFORM_ADMIN' },
  { label: 'Locations', path: '/locations', icon: MapPin, role: 'CLUB_ADMIN' },
  { label: 'Courts', path: '/courts', icon: Grid2X2, role: 'CLUB_ADMIN' },
  { label: 'Pricing', path: '/pricing', icon: Coins, role: 'CLUB_ADMIN' },
  { label: 'Memberships', path: '/memberships', icon: BadgeCheck, role: 'CLUB_ADMIN' },
  { label: 'Availability', path: '/availability', icon: Clock3, role: 'CLUB_ADMIN' },
  { label: 'Bookings', path: '/bookings', icon: CalendarDays, role: 'CLUB_ADMIN' },
  { label: 'Settings', path: '/settings', icon: Settings2 },
]

const pageCopy: Record<string, { title: string; description: string }> = {
  '/overview': {
    title: 'Overview',
    description: 'Your club operations will come together here.',
  },
  '/clubs': {
    title: 'Clubs',
    description: 'Create and manage clubs on the platform.',
  },
  '/locations': {
    title: 'Locations',
    description: 'Manage club locations, opening hours, and unavailable periods.',
  },
  '/courts': {
    title: 'Courts',
    description: 'Manage courts, booking durations, and court hours.',
  },
  '/pricing': {
    title: 'Pricing',
    description: 'Configure shifts and court rates for your club.',
  },
  '/memberships': {
    title: 'Memberships',
    description: 'Manage membership plans and duration-based prices.',
  },
  '/availability': {
    title: 'Availability',
    description: 'Review bookable slots using live schedules, closures, and bookings.',
  },
  '/bookings': {
    title: 'Bookings',
    description: 'Review and manage your club bookings.',
  },
  '/settings': {
    title: 'Account and workspace',
    description: 'Review your administrator account and workspace details.',
  },
}

function App() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, isReady, logout } = useAuth()
  const page = pageCopy[pathname] ?? pageCopy['/']
  const homePath = user?.role === 'PLATFORM_ADMIN' ? '/clubs' : '/locations'

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Restoring your session…</div>
  }
  if (!user) {
    return pathname === '/login' ? <LoginPage /> : <Navigate to="/login" replace />
  }
  if (pathname === '/login') return <Navigate to={homePath} replace />
  if (pathname === '/') return <Navigate to={homePath} replace />
  const isClubAdminPath = ['/locations', '/courts', '/pricing', '/memberships', '/availability', '/bookings'].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
  const isPlatformAdminPath = pathname === '/clubs' || pathname.startsWith('/clubs/')
  if (user.role === 'PLATFORM_ADMIN' && isClubAdminPath) {
    return <Navigate to="/clubs" replace />
  }
  if (user.role === 'CLUB_ADMIN' && isPlatformAdminPath) {
    return <Navigate to="/locations" replace />
  }
  const visibleNavigation = navigation.filter((item) => !('role' in item) || item.role === user.role)
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const roleLabel = user.role === 'PLATFORM_ADMIN' ? 'Platform administrator' : 'Club administrator'

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      {mobileNavOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/35 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-border bg-background transition-transform lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-border px-6">
          <NavLink to="/" className="flex items-center gap-3" onClick={() => setMobileNavOpen(false)}>
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Grid2X2 aria-hidden="true" className="size-[18px]" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">Clubhouse</span>
              <span className="block text-[11px] text-muted-foreground">Management</span>
            </span>
          </NavLink>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X />
          </Button>
        </div>

        <div className="px-4 pt-6">
          <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
            Workspace
          </p>
          <nav aria-label="Main navigation" className="space-y-1">
            {visibleNavigation.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${isActive ? 'bg-primary/8 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
                }
              >
                <Icon aria-hidden="true" className="size-[17px]" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-900">
              {initials || 'A'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{user.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{roleLabel}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void logout().catch(() => undefined).finally(() => navigate('/login', { replace: true }))}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu />
            </Button>
            <div>
              <p className="text-[11px] text-muted-foreground">{user.club?.name ?? 'Platform workspace'}</p>
              <h1 className="text-sm font-semibold">{page.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="ml-2 hidden h-8 items-center gap-2 border-l border-border pl-4 sm:flex">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">Admin workspace</span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] p-4 sm:p-8">
          <div className="mb-6">
            <p className="text-xs text-muted-foreground">Workspace / {page.title}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{page.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{page.description}</p>
          </div>
          <Routes>
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/clubs" element={<ClubsPage />} />
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/courts" element={<CourtsPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/memberships" element={<MembershipsPage />} />
            <Route path="/availability" element={<AvailabilityPage />} />
            <Route path="/bookings" element={<BookingsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to={homePath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
