"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

type ClubLocation = { id: string; name: string; address: string; durations: number[] };
type Profile = { name: string; club: { timezone: string } | null };
type Slot = { startTime: string; endTime: string; price: number | null; priceNote?: string; breakdown?: { shiftName?: string; price: number }[] };
type CourtSlots = { courtId: string; courtName: string; slots: Slot[] };
type Availability = {
  locationName: string;
  date: string;
  durationMinutes: number;
  timezone: string;
  notice: string | null;
  pricing: { model: string; membership: { name: string } | null; note: string | null };
  courts: CourtSlots[];
};
type ApiError = { message?: string | string[] };

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function clubDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function upcomingDates(timeZone: string) {
  const [year, month, day] = clubDate(timeZone).split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

function dateLabel(date: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone }).format(new Date(`${date}T12:00:00Z`));
}

function durationLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
}

export function AvailabilityView({ location, profile, onBack, onSignOut }: { location: ClubLocation; profile: Profile; onBack: () => void; onSignOut: () => void }) {
  const timeZone = profile.club?.timezone || "Asia/Kolkata";
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(location.durations[0]);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const nextDates = upcomingDates(timeZone);
    setDates(nextDates);
    setDate(nextDates[0]);
  }, [timeZone]);

  const loadAvailability = useCallback(async (signal: AbortSignal) => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      setError("Your session has ended. Please sign in again.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ locationId: location.id, date, durationMinutes: String(duration) });
    try {
      const response = await fetch(`${apiBaseUrl}/availability?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal });
      const result = (await response.json().catch(() => ({}))) as Availability & ApiError;
      if (!response.ok) {
        const message = Array.isArray(result.message) ? result.message.join(" ") : result.message;
        throw new Error(message || "We couldn’t load court availability.");
      }
      setAvailability(result);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "We couldn’t load court availability.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [date, duration, location.id]);

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    void loadAvailability(controller.signal);
    return () => controller.abort();
  }, [loadAvailability]);

  const selectedDateLabel = date ? dateLabel(date, timeZone) : "Loading dates…";

  return (
    <main className="min-h-screen bg-[#f6f8f5] text-[#19251e]">
      <header className="border-b border-[#e6ebe6] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Button onClick={onBack} variant="ghost" className="h-9 rounded-lg px-2 text-sm text-[#526158]"><ArrowLeft size={16} className="mr-2"/>Locations</Button><div className="flex items-center gap-3"><span className="hidden font-heading text-sm font-semibold sm:inline">{location.name}</span><Button onClick={onSignOut} variant="outline" className="h-9 rounded-lg border-[#dfe6df] px-3 text-xs">Sign out</Button></div></div></header>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-9 sm:px-8 sm:pt-12">
        <p className="mb-2 text-sm font-medium text-[#568167]">{location.address}</p><h1 className="font-heading text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Find a time to play</h1><p className="mt-2 text-sm text-[#738077]">Choose a day and session length to see live court availability.</p>
        <div className="mt-8 rounded-2xl border border-[#e4eae4] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#344239]"><CalendarDays size={17} className="text-[#568167]"/>Select a day</div><label className="flex items-center gap-2 text-sm text-[#66746a]"><Clock3 size={16}/><span className="sr-only">Session duration</span><select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="h-10 rounded-lg border border-[#dfe6df] bg-white px-3 text-sm text-[#344239] outline-none focus:border-[#6e9b78]">{location.durations.map((minutes) => <option key={minutes} value={minutes}>{durationLabel(minutes)}</option>)}</select></label></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{dates.map((day) => { const selected = day === date; return <button key={day} type="button" onClick={() => setDate(day)} className={`rounded-xl border px-3 py-3 text-left transition ${selected ? "border-[#2e704b] bg-[#edf5ed] text-[#214a33]" : "border-[#e5eae5] bg-white text-[#657268] hover:border-[#b7cdb9]"}`}><span className="block text-xs">{dateLabel(day, timeZone).split(",")[0]}</span><span className="mt-1 block text-sm font-semibold">{dateLabel(day, timeZone).split(",")[1]?.trim()}</span></button>; })}</div>
        </div>

        <div className="mb-4 mt-9 flex items-end justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">Available courts</h2><p className="mt-1 text-sm text-[#7b877e]">{selectedDateLabel} · {durationLabel(duration)} sessions · club time</p></div>{availability?.pricing.membership && <span className="rounded-full bg-[#e8f2e9] px-3 py-1.5 text-xs font-medium text-[#36704a]">{availability.pricing.membership.name} pricing</span>}</div>
        {loading && <div className="grid gap-4 md:grid-cols-2"><div className="h-48 animate-pulse rounded-2xl bg-[#e9eee9]"/><div className="h-48 animate-pulse rounded-2xl bg-[#e9eee9]"/></div>}
        {!loading && error && <div role="alert" className="rounded-2xl border border-[#f1d4cc] bg-white p-6"><p className="text-sm text-[#a4412d]">{error}</p><Button onClick={() => { const controller = new AbortController(); void loadAvailability(controller.signal); }} variant="outline" className="mt-4 h-10 rounded-lg"><RefreshCw size={15} className="mr-2"/>Try again</Button></div>}
        {!loading && !error && availability && <>
          {availability.notice && <p className="mb-4 rounded-xl border border-[#e9e4ce] bg-[#fffcef] px-4 py-3 text-sm text-[#766b3c]">{availability.notice}</p>}
          {availability.pricing.note && <p className="mb-4 text-xs text-[#77847a]">{availability.pricing.note}</p>}
          {availability.courts.length === 0 && <div className="rounded-2xl border border-dashed border-[#d8e1d8] bg-white px-6 py-14 text-center"><h3 className="font-heading text-lg font-semibold">No courts offer this session length</h3><p className="mt-2 text-sm text-[#738077]">Choose another duration to check available courts.</p></div>}
          <div className="grid gap-4 md:grid-cols-2">{availability.courts.map((court) => <article key={court.courtId} className="rounded-2xl border border-[#e4eae4] bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="font-heading text-lg font-semibold">{court.courtName}</h3><p className="mt-1 text-xs text-[#829087]">{durationLabel(duration)} court session</p></div><span className="rounded-lg bg-[#edf5ed] px-2.5 py-1.5 text-[11px] font-semibold text-[#34704a]">{court.slots.length} {court.slots.length === 1 ? "time" : "times"}</span></div>
              {court.slots.length === 0 ? <p className="mt-6 rounded-xl bg-[#f7f9f6] px-4 py-5 text-center text-sm text-[#7e8b81]">No times available on this day.</p> : <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">{court.slots.map((slot) => <div key={`${court.courtId}-${slot.startTime}`} className="rounded-xl border border-[#e8ece8] bg-[#fcfdfb] px-3 py-3"><p className="text-sm font-semibold text-[#344239]">{slot.startTime} <span className="font-normal text-[#9aa39b]">–</span> {slot.endTime}</p><p className="mt-1.5 text-xs font-medium text-[#4e785b]">{slot.price === null ? "Price unavailable" : slot.price.toFixed(2)}{slot.price === null && slot.priceNote ? <span className="mt-1 block font-normal text-[#879289]">{slot.priceNote}</span> : null}</p></div>)}</div>}
            </article>)}</div>
          <p className="mt-6 text-center text-xs text-[#929d94]">Prices are quoted by your club. Booking and payment confirmation come in the next step.</p>
        </>}
      </section>
    </main>
  );
}
