"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  MapPin,
  ShieldCheck,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationsView } from "@/components/consumer/locations-view";
import { useAuthStore } from "@/store/auth-store";

type AuthMode = "login" | "register";
type ApiError = { message?: string | string[] };
type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    clubId: string | null;
  };
};
type Profile = AuthResponse["user"] & {
  club: { id: string; name: string; slug: string; timezone: string } | null;
};

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(" ")
      : data.message;
    throw new Error(
      message || "We couldn’t complete that request. Please try again.",
    );
  }
  return data;
}

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [clubSlug, setClubSlug] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    let active = true;
    const saved = useAuthStore.getState();
    if (!saved.accessToken || !saved.refreshToken) {
      setRestoringSession(false);
      return;
    }

    async function restoreSession() {
      try {
        let currentUser: Profile;
        try {
          currentUser = await request<Profile>("/auth/me", {
            headers: { Authorization: `Bearer ${saved.accessToken}` },
          });
        } catch {
          const refreshed = await request<AuthResponse>("/auth/refresh", {
            method: "POST",
            body: JSON.stringify({ refreshToken: saved.refreshToken }),
          });
          setSession(refreshed.accessToken, refreshed.refreshToken, refreshed.user);
          currentUser = await request<Profile>("/auth/me", {
            headers: { Authorization: `Bearer ${refreshed.accessToken}` },
          });
        }
        if (active) setProfile(currentUser);
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setRestoringSession(false);
      }
    }

    void restoreSession();
    return () => { active = false; };
  }, [clearSession, setSession]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload =
        mode === "register"
          ? {
              clubSlug: clubSlug.trim(),
              name: name.trim(),
              email: email.trim(),
              password,
            }
          : { clubSlug: clubSlug.trim(), email: email.trim(), password };
      const tokens = await request<AuthResponse>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSession(tokens.accessToken, tokens.refreshToken, tokens.user);
      const currentUser = await request<Profile>("/auth/me", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      setProfile(currentUser);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.",
      );
      clearSession();
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    const accessToken = useAuthStore.getState().accessToken;
    try {
      if (accessToken)
        await request("/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
    } finally {
      clearSession();
      setProfile(null);
      setPassword("");
    }
  }

  if (profile) {
    return <LocationsView profile={profile} onSignOut={handleSignOut} />;
  }

  if (restoringSession) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f6f8f5] text-sm text-[#738077]">Restoring your session…</main>;
  }

  return (
    <main className="min-h-screen bg-[#f6f8f5] text-[#19251e] lg:grid lg:grid-cols-[1.04fr_.96fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#173c2c] px-12 py-10 text-white lg:flex lg:flex-col xl:px-20">
        <div className="absolute -right-36 top-16 size-128 rounded-full border border-white/10" />
        <div className="absolute -right-16 top-36 size-92 rounded-full border border-white/10" />
        <div className="absolute -bottom-28 -left-24 size-112 rounded-full bg-[#24543e]" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#d4f36b] text-[#173c2c]">
            <Trophy size={21} />
          </div>
          <span className="font-heading text-lg font-semibold tracking-tight">
            CourtSide
          </span>
        </div>
        <div className="relative my-auto max-w-xl py-14">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-[#d9e6dc]">
            <Sparkles size={14} className="text-[#d4f36b]" /> Your game, your
            time
          </div>
          <h1 className="font-heading text-5xl font-semibold leading-[1.12] tracking-[-.04em] xl:text-6xl">
            Make time for
            <br />
            <span className="text-[#d4f36b]">your best game.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[#c3d2c8]">
            Find a court, pick a time, and get back to what you love. Your club
            is just a few taps away.
          </p>
          <div className="mt-12 grid max-w-lg grid-cols-3 gap-3">
            {[
              {
                icon: CalendarDays,
                title: "Easy booking",
                note: "Choose your slot",
              },
              { icon: Clock3, title: "Your schedule", note: "Plan your week" },
              { icon: UsersRound, title: "Your club", note: "Play together" },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[.06] p-4"
              >
                <item.icon size={18} className="mb-5 text-[#d4f36b]" />
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-[#aebfb3]">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-[#aebfb3]">
          A better way to get on court.
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-110">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#173c2c] text-[#d4f36b]">
              <Trophy size={20} />
            </div>
            <span className="font-heading text-lg font-semibold">
              CourtSide
            </span>
          </div>
          <div className="mb-8">
            <p className="mb-2 text-sm font-medium text-[#568167]">
              {mode === "login" ? "Welcome back" : "Join your club"}
            </p>
            <h2 className="font-heading text-3xl font-semibold tracking-[-.035em]">
              {mode === "login" ? "Sign in to continue" : "Create your account"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#738077]">
              {mode === "login"
                ? "Enter your club and account details below."
                : "Create an account to book courts at your club."}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#eaf0eb] p-1">
            {(["login", "register"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setError("");
                }}
                className={`h-10 rounded-lg text-sm font-medium transition ${mode === value ? "bg-white text-[#20352a] shadow-sm" : "text-[#748178] hover:text-[#20352a]"}`}
              >
                {value === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#344239]">
                Club slug
              </span>
              <span className="relative block">
                <MapPin
                  size={17}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a968d]"
                />
                <Input
                  required
                  autoComplete="organization"
                  value={clubSlug}
                  onChange={(event) => setClubSlug(event.target.value)}
                  placeholder="e.g. downtown-sports"
                  className="h-12 rounded-xl border-[#dfe6df] bg-white pl-10 text-sm shadow-none focus-visible:ring-[#5f946e]/25"
                />
              </span>
              <span className="block text-xs text-[#849087]">
                Ask your club for its sign-in slug.
              </span>
            </label>
            {mode === "register" && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[#344239]">
                  Full name
                </span>
                <Input
                  required
                  maxLength={150}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  className="h-12 rounded-xl border-[#dfe6df] bg-white px-3.5 text-sm shadow-none focus-visible:ring-[#5f946e]/25"
                />
              </label>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#344239]">
                Email address
              </span>
              <Input
                required
                type="email"
                maxLength={190}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-xl border-[#dfe6df] bg-white px-3.5 text-sm shadow-none focus-visible:ring-[#5f946e]/25"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#344239]">
                Password
              </span>
              <span className="relative block">
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  minLength={mode === "register" ? 8 : 1}
                  maxLength={72}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    mode === "register"
                      ? "At least 8 characters"
                      : "Enter your password"
                  }
                  className="h-12 rounded-xl border-[#dfe6df] bg-white px-3.5 pr-11 text-sm shadow-none focus-visible:ring-[#5f946e]/25"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a968d] hover:text-[#344239]"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
              {mode === "register" && (
                <span className="block text-xs text-[#849087]">
                  Use 8–72 characters.
                </span>
              )}
            </label>
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[#f1d4cc] bg-[#fff6f3] px-4 py-3 text-sm leading-5 text-[#a4412d]"
              >
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#1c5138] text-sm font-semibold text-white shadow-[0_7px_18px_-9px_rgba(28,81,56,.65)] hover:bg-[#17452f]"
            >
              {loading
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              {!loading && <ArrowRight size={17} className="ml-2" />}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-[#879289]">
            {mode === "login"
              ? "New to your club? "
              : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="font-semibold text-[#39724f] hover:underline"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-[#98a199]">
            <ShieldCheck size={14} />
            <span>Your account details are sent securely to your club.</span>
            <CircleHelp size={13} className="ml-1" aria-hidden="true" />
          </div>
        </div>
      </section>
    </main>
  );
}
