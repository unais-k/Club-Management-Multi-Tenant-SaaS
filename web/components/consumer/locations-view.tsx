"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Clock3, MapPin, RefreshCw, SlidersHorizontal, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore, type AuthUser } from "@/store/auth-store";
import { AvailabilityView } from "@/components/consumer/availability-view";

type LocationOpeningHour = { dayOfWeek: number; openTime: string; closeTime: string };
type ClubLocation = {
  id: string;
  name: string;
  address: string;
  details: string | null;
  durations: number[];
  openingHours: LocationOpeningHour[];
};
type Profile = AuthUser & {
  club: { id: string; name: string; slug: string; timezone: string } | null;
};
type Props = { profile: Profile; onSignOut: () => void };
type ApiResponse = { data?: ClubLocation[]; message?: string | string[] };

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDuration(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;
}

export function LocationsView({ profile, onSignOut }: Props) {
  const [locations, setLocations] = useState<ClubLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [today, setToday] = useState<number | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<ClubLocation | null>(null);

  const loadLocations = useCallback(async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      setError("Your session has ended. Please sign in again.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/locations?page=1&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json().catch(() => ({}))) as ApiResponse;
      if (!response.ok) {
        const message = Array.isArray(result.message) ? result.message.join(" ") : result.message;
        throw new Error(message || "We couldn’t load the club locations.");
      }
      setLocations(result.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t load the club locations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setToday(new Date().getDay());
    void loadLocations();
  }, [loadLocations]);

  const todayName = today === null ? "Today" : weekdays[today];

  if (selectedLocation) {
    return <AvailabilityView location={selectedLocation} profile={profile} onBack={() => setSelectedLocation(null)} onSignOut={onSignOut} />;
  }

  return (
    <main className="min-h-screen bg-[#f6f8f5] text-[#19251e]">
      <header className="border-b border-[#e6ebe6] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-[#173c2c] text-[#d4f36b]"><Trophy size={20} /></div><div><p className="font-heading text-base font-semibold">CourtSide</p><p className="text-xs text-[#859087]">{profile.club?.name ?? "Your club"}</p></div></div>
          <div className="flex items-center gap-3"><span className="hidden text-sm text-[#69766d] sm:block">Hi, {profile.name.split(" ")[0]}</span><Button onClick={onSignOut} variant="outline" className="h-9 rounded-lg border-[#dfe6df] px-3 text-xs">Sign out</Button></div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 text-sm font-medium text-[#568167]">{profile.club?.name ?? "Your club"}</p><h1 className="font-heading text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Choose a location</h1><p className="mt-2 text-sm text-[#738077]">Explore your club’s courts and opening times.</p></div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-[#e3e9e3] bg-white px-3.5 py-2.5 text-sm text-[#6d7b71]"><SlidersHorizontal size={15} /> {loading ? "Loading locations" : `${locations.length} ${locations.length === 1 ? "location" : "locations"}`}</div>
        </div>

        {loading && <div className="grid gap-4 sm:grid-cols-2"><div className="h-56 animate-pulse rounded-2xl bg-[#e9eee9]" /><div className="h-56 animate-pulse rounded-2xl bg-[#e9eee9]" /></div>}
        {!loading && error && <div role="alert" className="rounded-2xl border border-[#f1d4cc] bg-white p-6"><p className="text-sm text-[#a4412d]">{error}</p><Button onClick={loadLocations} variant="outline" className="mt-4 h-10 rounded-lg"><RefreshCw size={15} className="mr-2" />Try again</Button></div>}
        {!loading && !error && locations.length === 0 && <div className="rounded-2xl border border-dashed border-[#d8e1d8] bg-white px-6 py-16 text-center"><div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#edf3ed] text-[#568167]"><MapPin size={21} /></div><h2 className="font-heading text-lg font-semibold">No locations yet</h2><p className="mt-2 text-sm text-[#738077]">This club hasn’t opened a location for booking yet. Check back later.</p></div>}
        {!loading && !error && locations.length > 0 && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{locations.map((location) => {
          const hoursToday = today === null ? [] : location.openingHours.filter((hours) => hours.dayOfWeek === today);
          return <article key={location.id} className="group overflow-hidden rounded-2xl border border-[#e4eae4] bg-white transition hover:-translate-y-0.5 hover:border-[#c8d8ca] hover:shadow-[0_15px_40px_-28px_rgba(23,60,44,.38)]">
            <div className="relative flex h-28 items-end overflow-hidden bg-[linear-gradient(135deg,#1c5138,#2c6949_55%,#91a94d)] p-5"><div className="absolute -right-4 -top-14 size-44 rounded-full border border-white/15"/><div className="absolute right-9 -top-5 size-28 rounded-full border border-white/15"/><div className="relative flex size-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-[#e4f5c0]"><MapPin size={20}/></div><span className="relative ml-auto rounded-full bg-[#d4f36b] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#29431d]">{hoursToday.length ? "Hours today" : "No hours today"}</span></div>
            <div className="p-5"><h2 className="font-heading text-lg font-semibold tracking-tight">{location.name}</h2><p className="mt-2 flex items-start gap-2 text-sm leading-5 text-[#738077]"><MapPin size={15} className="mt-0.5 shrink-0"/>{location.address}</p>{location.details && <p className="mt-3 line-clamp-2 text-sm leading-5 text-[#89938b]">{location.details}</p>}
              <div className="mt-5 border-t border-[#edf0ed] pt-4"><div className="flex items-center gap-2 text-xs font-semibold text-[#58675c]"><Clock3 size={14} className="text-[#568167]"/>Today · {todayName}</div><p className="mt-2 pl-[22px] text-sm text-[#738077]">{hoursToday.length ? hoursToday.map((hours) => `${hours.openTime} – ${hours.closeTime}`).join(" · ") : "No opening hours listed"}</p></div>
              <div className="mt-4 flex flex-wrap gap-1.5">{location.durations.map((duration) => <span key={duration} className="rounded-md bg-[#f0f4ef] px-2 py-1 text-[11px] font-medium text-[#637266]">{formatDuration(duration)}</span>)}</div>
              <Button onClick={() => setSelectedLocation(location)} className="mt-5 h-10 w-full rounded-lg bg-[#1c5138] text-sm text-white hover:bg-[#17452f]">View availability <ArrowRight size={15} className="ml-2" /></Button>
            </div>
          </article>;
        })}</div>}
        <p className="mt-8 text-center text-xs text-[#98a199]">Showing active locations for {profile.club?.name ?? "your club"}.</p>
      </section>
    </main>
  );
}
