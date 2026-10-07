import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, Grid2X2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/auth-context'

type LoginMode = 'platform' | 'club'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<LoginMode>('platform')
  const [clubSlug, setClubSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const user = await login({
        email,
        password,
        ...(mode === 'club' ? { clubSlug: clubSlug.trim() } : {}),
      })
      navigate(user.role === 'PLATFORM_ADMIN' ? '/clubs' : '/locations', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.92fr)]">
      <section className="relative hidden overflow-hidden bg-[#17152b] px-12 py-10 text-white lg:flex lg:flex-col xl:px-20">
        <div className="absolute -left-24 top-1/4 size-105 rounded-full bg-violet-500/20 blur-[100px]" />
        <div className="absolute -bottom-32 right-0 size-115 rounded-full bg-indigo-400/15 blur-[110px]" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Grid2X2 className="size-5" />
          </span>
          <span className="font-montserrat text-base font-semibold tracking-tight">Clubhouse</span>
        </div>

        <div className="relative my-auto max-w-xl pb-12">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/75">
            <ShieldCheck className="size-3.5 text-violet-300" />
            A clearer view of every club
          </span>
          <h1 className="font-montserrat text-4xl font-semibold leading-[1.14] tracking-tight xl:text-5xl">
            Your club operations,
            <span className="mt-2 block text-violet-300">all in one place.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-white/60">
            Sign in to manage clubs, locations, courts, and the details that keep your spaces running.
          </p>
          <div className="mt-12 grid max-w-md grid-cols-3 gap-3">
            {[
              ['Clubs', 'Manage tenants'],
              ['Locations', 'Set schedules'],
              ['Courts', 'Organize spaces'],
            ].map(([label, hint]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/4 p-3.5">
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-1 text-[10px] text-white/45">{hint}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/40">Clubhouse Management · Admin portal</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-102.5">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Grid2X2 className="size-5" />
            </span>
            <span className="font-montserrat text-base font-semibold">Clubhouse</span>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Welcome back</p>
          <h2 className="mt-3 font-montserrat text-3xl font-semibold tracking-tight">Sign in to your account</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use your admin credentials to continue.</p>

          <div className="mt-8 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Account type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'platform'}
              onClick={() => { setMode('platform'); setError('') }}
              className={`rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${mode === 'platform' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Platform admin
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'club'}
              onClick={() => { setMode('club'); setError('') }}
              className={`rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${mode === 'club' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Club admin
            </button>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            {mode === 'club' && (
              <label className="block space-y-2">
                <span className="text-xs font-medium">Club slug</span>
                <input
                  autoComplete="organization"
                  required
                  value={clubSlug}
                  onChange={(event) => setClubSlug(event.target.value)}
                  placeholder="downtown-sports"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <span className="block text-[11px] text-muted-foreground">The short name in your club’s sign-in link.</span>
              </label>
            )}
            <label className="block space-y-2">
              <span className="text-xs font-medium">Email address</span>
              <input
                autoComplete="username"
                autoCapitalize="none"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@club.com"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-medium">Password</span>
              <span className="relative block">
                <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-11 w-full rounded-lg border border-input bg-background py-2 pl-10 pr-11 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs leading-5 text-destructive">
                {error}
              </p>
            )}

            <Button className="h-11 w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
              {!isSubmitting && <ArrowRight className="ml-2 size-4" />}
            </Button>
          </form>

          <p className="mt-8 text-center text-[11px] leading-5 text-muted-foreground">
            By continuing, you confirm you are authorized to access this admin workspace.
          </p>
        </div>
      </section>
    </main>
  )
}
