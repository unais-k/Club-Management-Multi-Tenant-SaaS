"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock3,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore, type AuthUser } from "@/store/auth-store";

type PlanPrice = { durationMinutes: number; price: number };
type Plan = {
  id: string;
  name: string;
  description: string | null;
  validityDays: number;
  isActive: boolean;
  prices: PlanPrice[];
};
type UserMembership = {
  id: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  startsAt: string;
  expiresAt: string;
  daysLeft: number;
  membership: {
    id: string;
    name: string;
    description: string | null;
    validityDays: number;
    prices: PlanPrice[];
  } | null;
};
type Profile = AuthUser & {
  club: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    pricingModel: string;
  } | null;
};
type ApiError = { message?: string | string[] };
type MyMembershipsResponse = {
  current: UserMembership | null;
  active: UserMembership[];
  history: UserMembership[];
};

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

async function readError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as ApiError;
  return Array.isArray(data.message) ? data.message.join(" ") : data.message;
}

function formatDuration(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

export default function MembershipsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [myMemberships, setMyMemberships] = useState<MyMembershipsResponse>({
    current: null,
    active: [],
    history: [],
  });
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const clearSession = useAuthStore((state) => state.clearSession);

  const loadPageData = useCallback(async (token: string) => {
    const [profileResponse, plansResponse, membershipResponse] =
      await Promise.all([
        fetch(`${apiBaseUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBaseUrl}/memberships`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBaseUrl}/me/membership`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
    if (!profileResponse.ok)
      throw new Error(
        (await readError(profileResponse)) ||
          "Your session has ended. Please sign in again.",
      );
    if (!plansResponse.ok)
      throw new Error(
        (await readError(plansResponse)) ||
          "We couldn’t load membership plans.",
      );
    if (!membershipResponse.ok)
      throw new Error(
        (await readError(membershipResponse)) ||
          "We couldn’t load your membership status.",
      );
    const [user, availablePlans, currentMemberships] = await Promise.all([
      profileResponse.json() as Promise<Profile>,
      plansResponse.json() as Promise<Plan[]>,
      membershipResponse.json() as Promise<MyMembershipsResponse>,
    ]);
    setProfile(user);
    setPlans(availablePlans);
    setMyMemberships(currentMemberships);
  }, []);

  const refreshPageData = useCallback(async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await loadPageData(token);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t load membership plans.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadPageData, router]);

  useEffect(() => {
    void refreshPageData();
  }, [refreshPageData]);

  async function joinPlan(plan: Plan) {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      router.replace("/");
      return;
    }
    setJoiningId(plan.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/memberships/${plan.id}/subscribe`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok)
        throw new Error(
          (await readError(response)) || "We couldn’t join this plan.",
        );
      await response.json();
      await loadPageData(token);
      setNotice(
        `You joined the ${plan.name} plan. Your membership is active now.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t join this plan.",
      );
    } finally {
      setJoiningId(null);
    }
  }

  async function signOut() {
    const token = useAuthStore.getState().accessToken;
    try {
      if (token)
        await fetch(`${apiBaseUrl}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
    } finally {
      clearSession();
      router.replace("/");
    }
  }

  const activePlanIds = new Set(
    myMemberships.active.map((item) => item.membership?.id).filter(Boolean),
  );
  const timeZone = profile?.club?.timezone || "Asia/Kolkata";

  return (
    <main className="min-h-screen bg-[#f6f8f5] text-[#19251e]">
      <header className="border-b border-[#e6ebe6] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#173c2c] text-[#d4f36b]">
              <Trophy size={20} />
            </div>
            <div>
              <p className="font-heading text-base font-semibold">CourtSide</p>
              <p className="text-xs text-[#859087]">
                {profile?.club?.name ?? "Your club"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-lg px-2 text-xs font-medium text-[#526158] hover:bg-[#f2f5f1] sm:px-3"
            >
              <ArrowLeft size={15} className="mr-1.5" />
              Courts
            </Link>
            <Link
              href="/bookings"
              className="inline-flex h-9 items-center rounded-lg px-2 text-xs font-medium text-[#526158] hover:bg-[#f2f5f1] sm:px-3"
            >
              Bookings
            </Link>
            <Button
              onClick={signOut}
              variant="outline"
              className="h-9 rounded-lg border-[#dfe6df] px-2.5 text-xs sm:px-3"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <p className="mb-2 text-sm font-medium text-[#568167]">
          {profile?.club?.name ?? "Your club"}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-[-.035em] sm:text-4xl">
          Membership plans
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#738077]">
          Choose a plan to activate member pricing for your court bookings.
        </p>

        <div className="mt-6 rounded-xl border border-[#e9e4ce] bg-[#fffcef] px-4 py-3 text-xs leading-5 text-[#726b48]">
          Joining activates the membership immediately. No membership payment is
          processed here. Prices shown are per court session, not membership
          fees.
        </div>
        {notice && (
          <p
            role="status"
            className="mt-4 flex items-center gap-2 rounded-xl border border-[#d8e8d8] bg-white px-4 py-3 text-sm text-[#34704a]"
          >
            <Check size={16} />
            {notice}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-[#f1d4cc] bg-white px-4 py-3 text-sm text-[#a4412d]"
          >
            <p>{error}</p>
            <Button
              onClick={() => void refreshPageData()}
              variant="outline"
              className="h-8 shrink-0 rounded-lg text-xs"
            >
              <RefreshCw size={13} className="mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {myMemberships.active.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-heading text-lg font-semibold">
              Your active memberships
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {myMemberships.active.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[#dce8dc] bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-[#e9f3ec] text-[#24704d]">
                        <BadgeCheck size={19} />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold">
                          {item.membership?.name ?? "Membership"}
                        </h3>
                        <p className="mt-1 text-xs text-[#738077]">
                          {item.daysLeft} days remaining
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[#e9f3ec] px-2.5 py-1 text-[10px] font-semibold text-[#34704a]">
                      Active
                    </span>
                  </div>
                  <p className="mt-4 flex items-center gap-1.5 text-xs text-[#7c887f]">
                    <CalendarDays size={14} />
                    Until {formatDate(item.expiresAt, timeZone)}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="mb-4 mt-9 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-heading text-xl font-semibold">
              Available plans
            </h2>
            <p className="mt-1 text-sm text-[#7b877e]">
              Member court prices by session length.
            </p>
          </div>
          {!loading && (
            <span className="rounded-xl border border-[#e3e9e3] bg-white px-3.5 py-2.5 text-sm text-[#6d7b71]">
              {plans.length} {plans.length === 1 ? "plan" : "plans"}
            </span>
          )}
        </div>
        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64 animate-pulse rounded-2xl bg-[#e9eee9]" />
            <div className="h-64 animate-pulse rounded-2xl bg-[#e9eee9]" />
          </div>
        )}
        {!loading && !error && plans.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#d8e1d8] bg-white px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#edf3ed] text-[#568167]">
              <BadgeCheck size={21} />
            </div>
            <h2 className="font-heading text-lg font-semibold">
              {profile?.club?.pricingModel === "SHIFT_BASED"
                ? "Memberships aren’t used here"
                : "No plans available"}
            </h2>
            <p className="mt-2 text-sm text-[#738077]">
              {profile?.club?.pricingModel === "SHIFT_BASED"
                ? "This club uses court prices by time of day. You can see the price when checking court availability."
                : "Your club hasn’t published a membership plan yet."}
            </p>
          </div>
        )}
        {!loading && !error && plans.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const alreadyActive = activePlanIds.has(plan.id);
              return (
                <article
                  key={plan.id}
                  className="flex flex-col rounded-2xl border border-[#e4eae4] bg-white p-5 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#edf5ed] text-[#34704a]">
                        <BadgeCheck size={20} />
                      </div>
                      <h3 className="font-heading text-lg font-semibold">
                        {plan.name}
                      </h3>
                    </div>
                    {alreadyActive && (
                      <span className="rounded-full bg-[#e9f3ec] px-2.5 py-1 text-[10px] font-semibold text-[#34704a]">
                        Your plan
                      </span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-2 text-sm leading-5 text-[#738077]">
                      {plan.description}
                    </p>
                  )}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-[#7c887f]">
                    <Clock3 size={14} />
                    {plan.validityDays} days validity
                  </p>
                  <div className="mt-5 border-t border-[#edf0ed] pt-4">
                    <p className="mb-3 text-xs font-semibold text-[#58675c]">
                      Court session prices
                    </p>
                    {plan.prices.length ? (
                      <div className="space-y-2">
                        {plan.prices.map((price) => (
                          <div
                            key={price.durationMinutes}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-[#738077]">
                              {formatDuration(price.durationMinutes)}
                            </span>
                            <span className="font-semibold text-[#344239]">
                              {price.price.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#89938b]">
                        No session prices listed.
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => void joinPlan(plan)}
                    disabled={alreadyActive || joiningId !== null}
                    className="mt-auto h-11 w-full rounded-xl bg-[#1c5138] text-sm font-semibold text-white hover:bg-[#17452f] disabled:bg-[#eaf0eb] disabled:text-[#748178]"
                  >
                    {joiningId === plan.id
                      ? "Joining…"
                      : alreadyActive
                        ? "Current plan"
                        : "Join membership"}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-[#98a199]">
          Memberships are managed by {profile?.club?.name ?? "your club"}.
        </p>
      </section>
    </main>
  );
}
