"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Clock3,
  RefreshCw,
  TicketCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/store/auth-store";

type ClubLocation = {
  id: string;
  name: string;
  address: string;
  durations: number[];
};
type Profile = { name: string; club: { timezone: string } | null };
type Slot = {
  startTime: string;
  endTime: string;
  price: number | null;
  priceNote?: string;
  breakdown?: { shiftName?: string; price: number }[];
};
type CourtSlots = { courtId: string; courtName: string; slots: Slot[] };
type Availability = {
  locationName: string;
  date: string;
  durationMinutes: number;
  timezone: string;
  notice: string | null;
  pricing: {
    model: string;
    membership: { name: string } | null;
    note: string | null;
  };
  courts: CourtSlots[];
};
type ApiError = { message?: string | string[] };
type MyMembership = {
  status: string;
  package: { bookingDurationMinutes: number } | null;
  bookingsRemaining: number | null;
};
type MyMembershipsResponse = { current: MyMembership | null };
type SelectedSlot = { courtId: string; courtName: string; slot: Slot };
type BookingReceipt = {
  id: string;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  price: number;
  membershipName: string | null;
  court: { name: string | null };
  location: { name: string | null };
};

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

function clubDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function upcomingDates(timeZone: string) {
  const [year, month, day] = clubDate(timeZone).split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10),
  );
}

function dateLabel(date: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(`${date}T12:00:00Z`));
}

function durationLabel(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;
}

export function AvailabilityView({
  location,
  profile,
  onBack,
  onSignOut,
}: {
  location: ClubLocation;
  profile: Profile;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const timeZone = profile.club?.timezone || "Asia/Kolkata";
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(location.durations[0]);
  const [membershipDuration, setMembershipDuration] = useState<number | null>(
    null,
  );
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [membershipError, setMembershipError] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [bookingReceipt, setBookingReceipt] = useState<BookingReceipt | null>(
    null,
  );
  const [bookingError, setBookingError] = useState("");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const effectiveDuration = membershipDuration ?? duration;

  useEffect(() => {
    const controller = new AbortController();
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      setMembershipLoaded(true);
      return () => controller.abort();
    }

    async function loadCurrentMembership() {
      try {
        const response = await fetch(`${apiBaseUrl}/me/membership`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const result = (await response
          .json()
          .catch(() => ({}))) as MyMembershipsResponse & ApiError;
        if (!response.ok) {
          const message = Array.isArray(result.message)
            ? result.message.join(" ")
            : result.message;
          throw new Error(message || "We couldn’t load your membership.");
        }

        const current = result.current;
        if (
          current?.status === "ACTIVE" &&
          typeof current.bookingsRemaining === "number" &&
          current.bookingsRemaining > 0 &&
          current.package
        ) {
          const packageDuration = current.package.bookingDurationMinutes;
          if (!location.durations.includes(packageDuration)) {
            setMembershipError(
              `Your active membership includes ${durationLabel(packageDuration)} bookings, but this location doesn’t offer that duration. Please choose another location.`,
            );
          } else {
            setMembershipDuration(packageDuration);
            setDuration(packageDuration);
          }
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setMembershipError(
          caught instanceof Error
            ? caught.message
            : "We couldn’t load your membership.",
        );
      } finally {
        if (!controller.signal.aborted) setMembershipLoaded(true);
      }
    }

    void loadCurrentMembership();
    return () => controller.abort();
  }, [location.durations]);

  useEffect(() => {
    const nextDates = upcomingDates(timeZone);
    setDates(nextDates);
    setDate(nextDates[0]);
  }, [timeZone]);

  const loadAvailability = useCallback(
    async (signal: AbortSignal) => {
      if (!membershipLoaded) return undefined;
      if (membershipError) {
        setError(membershipError);
        setLoading(false);
        return undefined;
      }
      const token = useAuthStore.getState().accessToken;
      if (!token) {
        setError("Your session has ended. Please sign in again.");
        setLoading(false);
        return undefined;
      }
      setLoading(true);
      setError("");
      const query = new URLSearchParams({
        locationId: location.id,
        date,
        durationMinutes: String(effectiveDuration),
      });
      try {
        const response = await fetch(`${apiBaseUrl}/availability?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const result = (await response
          .json()
          .catch(() => ({}))) as Availability & ApiError;
        if (!response.ok) {
          const message = Array.isArray(result.message)
            ? result.message.join(" ")
            : result.message;
          throw new Error(message || "We couldn’t load court availability.");
        }
        setAvailability(result);
        return result;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "We couldn’t load court availability.",
        );
        return undefined;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [date, effectiveDuration, location.id, membershipError, membershipLoaded],
  );

  function chooseSlot(courtId: string, courtName: string, slot: Slot) {
    setSelectedSlot({ courtId, courtName, slot });
    setBookingReceipt(null);
    setBookingError("");
    setBookingOpen(true);
  }

  async function confirmBooking() {
    if (!selectedSlot || selectedSlot.slot.price === null) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      setBookingError("Your session has ended. Please sign in again.");
      return;
    }
    setBookingSubmitting(true);
    setBookingError("");
    let failureStatus = 0;
    try {
      const response = await fetch(`${apiBaseUrl}/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          courtId: selectedSlot.courtId,
          date,
          startTime: selectedSlot.slot.startTime,
          durationMinutes: effectiveDuration,
          expectedPrice: selectedSlot.slot.price,
        }),
      });
      const result = (await response
        .json()
        .catch(() => ({}))) as BookingReceipt & ApiError;
      if (!response.ok) {
        failureStatus = response.status;
        const message = Array.isArray(result.message)
          ? result.message.join(" ")
          : result.message;
        throw new Error(
          message || "We couldn’t confirm this booking. Please try again.",
        );
      }
      setBookingReceipt(result);
      const controller = new AbortController();
      void loadAvailability(controller.signal);
    } catch (caught) {
      if (failureStatus === 409 && selectedSlot) {
        const refreshed = await loadAvailability(new AbortController().signal);
        const updatedCourt = refreshed?.courts.find(
          (court) => court.courtId === selectedSlot.courtId,
        );
        const updatedSlot = updatedCourt?.slots.find(
          (slot) => slot.startTime === selectedSlot.slot.startTime,
        );
        if (updatedSlot && updatedCourt) {
          setSelectedSlot({
            courtId: updatedCourt.courtId,
            courtName: updatedCourt.courtName,
            slot: updatedSlot,
          });
          setBookingError(
            "The price or availability changed. Review the updated quote before confirming again.",
          );
        } else {
          setSelectedSlot(null);
          setBookingError(
            "That time is no longer available. Go back and choose another slot.",
          );
        }
      } else {
        setBookingError(
          caught instanceof Error
            ? caught.message
            : "We couldn’t confirm this booking. Please try again.",
        );
      }
    } finally {
      setBookingSubmitting(false);
    }
  }

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    void loadAvailability(controller.signal);
    return () => controller.abort();
  }, [loadAvailability]);

  const selectedDateLabel = date ? dateLabel(date, timeZone) : "Loading dates…";

  return (
    <main className="min-h-screen bg-[#f6f8f5] text-[#19251e]">
      <header className="border-b border-[#e6ebe6] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Button
            onClick={onBack}
            variant="ghost"
            className="h-9 rounded-lg px-2 text-sm text-[#526158]"
          >
            <ArrowLeft size={16} className="mr-2" />
            Locations
          </Button>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="hidden font-heading text-sm font-semibold sm:inline">
              {location.name}
            </span>
            <Link
              href="/bookings"
              className="inline-flex h-9 items-center rounded-lg px-2 text-xs font-medium text-[#526158] hover:bg-[#f2f5f1] sm:px-3"
            >
              Bookings
            </Link>
            <Link
              href="/memberships"
              className="inline-flex h-9 items-center rounded-lg px-2 text-xs font-medium text-[#526158] hover:bg-[#f2f5f1] sm:px-3"
            >
              Memberships
            </Link>
            <Button
              onClick={onSignOut}
              variant="outline"
              className="h-9 rounded-lg border-[#dfe6df] px-2.5 text-xs sm:px-3"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-9 sm:px-8 sm:pt-12">
        <p className="mb-2 text-sm font-medium text-[#568167]">
          {location.address}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-[-.035em] sm:text-4xl">
          Find a time to play
        </h1>
        <p className="mt-2 text-sm text-[#738077]">
          Choose a day and session length to see live court availability.
        </p>
        <div className="mt-8 rounded-2xl border border-[#e4eae4] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#344239]">
              <CalendarDays size={17} className="text-[#568167]" />
              Select a day
            </div>
            {!membershipLoaded ? (
              <p className="flex items-center gap-2 text-sm text-[#66746a]">
                <Clock3 size={16} /> Checking membership…
              </p>
            ) : membershipDuration !== null ? (
              <p className="flex items-center gap-2 rounded-lg bg-[#edf5ed] px-3 py-2 text-sm font-medium text-[#34704a]">
                <BadgeCheck size={16} /> Membership booking ·{" "}
                {durationLabel(membershipDuration)}
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm text-[#66746a]">
                <Clock3 size={16} />
                <span className="sr-only">Session duration</span>
                <select
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="h-10 rounded-lg border border-[#dfe6df] bg-white px-3 text-sm text-[#344239] outline-none focus:border-[#6e9b78]"
                >
                  {location.durations.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {durationLabel(minutes)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {dates.map((day) => {
              const selected = day === date;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setDate(day)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${selected ? "border-[#2e704b] bg-[#edf5ed] text-[#214a33]" : "border-[#e5eae5] bg-white text-[#657268] hover:border-[#b7cdb9]"}`}
                >
                  <span className="block text-xs">
                    {dateLabel(day, timeZone).split(",")[0]}
                  </span>
                  <span className="mt-1 block text-sm font-semibold">
                    {dateLabel(day, timeZone).split(",")[1]?.trim()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4 mt-9 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold">
              Available courts
            </h2>
            <p className="mt-1 text-sm text-[#7b877e]">
              {selectedDateLabel} · {durationLabel(effectiveDuration)} sessions · club
              time
            </p>
          </div>
          {availability?.pricing.membership && (
            <span className="rounded-full bg-[#e8f2e9] px-3 py-1.5 text-xs font-medium text-[#36704a]">
              {availability.pricing.membership.name} pricing
            </span>
          )}
        </div>
        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-48 animate-pulse rounded-2xl bg-[#e9eee9]" />
            <div className="h-48 animate-pulse rounded-2xl bg-[#e9eee9]" />
          </div>
        )}
        {!loading && error && (
          <div
            role="alert"
            className="rounded-2xl border border-[#f1d4cc] bg-white p-6"
          >
            <p className="text-sm text-[#a4412d]">{error}</p>
            <Button
              onClick={() => {
                const controller = new AbortController();
                void loadAvailability(controller.signal);
              }}
              variant="outline"
              className="mt-4 h-10 rounded-lg"
            >
              <RefreshCw size={15} className="mr-2" />
              Try again
            </Button>
          </div>
        )}
        {!loading && !error && availability && (
          <>
            {availability.notice && (
              <p className="mb-4 rounded-xl border border-[#e9e4ce] bg-[#fffcef] px-4 py-3 text-sm text-[#766b3c]">
                {availability.notice}
              </p>
            )}
            {availability.pricing.note && (
              <p className="mb-4 text-xs text-[#77847a]">
                {availability.pricing.note}
              </p>
            )}
            {availability.courts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#d8e1d8] bg-white px-6 py-14 text-center">
                <h3 className="font-heading text-lg font-semibold">
                  No courts offer this session length
                </h3>
                <p className="mt-2 text-sm text-[#738077]">
                  {membershipDuration !== null
                    ? "Try another day or location for a court that supports your membership duration."
                    : "Choose another duration to check available courts."}
                </p>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {availability.courts.map((court) => (
                <article
                  key={court.courtId}
                  className="rounded-2xl border border-[#e4eae4] bg-white p-5 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-heading text-lg font-semibold">
                        {court.courtName}
                      </h3>
                      <p className="mt-1 text-xs text-[#829087]">
                        {durationLabel(effectiveDuration)} court session
                      </p>
                    </div>
                    <span className="rounded-lg bg-[#edf5ed] px-2.5 py-1.5 text-[11px] font-semibold text-[#34704a]">
                      {court.slots.length}{" "}
                      {court.slots.length === 1 ? "time" : "times"}
                    </span>
                  </div>
                  {court.slots.length === 0 ? (
                    <p className="mt-6 rounded-xl bg-[#f7f9f6] px-4 py-5 text-center text-sm text-[#7e8b81]">
                      No times available on this day.
                    </p>
                  ) : (
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {court.slots.map((slot) => (
                        <button
                          key={`${court.courtId}-${slot.startTime}`}
                          type="button"
                          disabled={slot.price === null}
                          onClick={() =>
                            chooseSlot(court.courtId, court.courtName, slot)
                          }
                          className="rounded-xl border border-[#e8ece8] bg-[#fcfdfb] px-3 py-3 text-left transition hover:border-[#a9c5ac] hover:bg-[#f3f8f2] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="block text-sm font-semibold text-[#344239]">
                            {slot.startTime}{" "}
                            <span className="font-normal text-[#9aa39b]">
                              –
                            </span>{" "}
                            {slot.endTime}
                          </span>
                          <span className="mt-1.5 block text-xs font-medium text-[#4e785b]">
                            {slot.price === null
                              ? "Price unavailable"
                              : slot.price.toFixed(2)}
                          </span>
                          {slot.price === null && slot.priceNote && (
                            <span className="mt-1 block text-[11px] font-normal text-[#879289]">
                              {slot.priceNote}
                            </span>
                          )}
                          <span className="sr-only">
                            Select {court.courtName} at {slot.startTime}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-[#929d94]">
              Select a time to review your booking. Payment is simulated for
              this step.
            </p>
          </>
        )}
      </section>
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="rounded-2xl border-[#e3e9e3] p-6 sm:max-w-md">
          {bookingReceipt ? (
            <>
              <DialogHeader>
                <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-[#e9f3ec] text-[#24704d]">
                  <BadgeCheck size={23} />
                </div>
                <DialogTitle className="font-heading text-xl font-semibold">
                  Booking confirmed
                </DialogTitle>
                <DialogDescription>
                  Your court is reserved. This demo did not charge you.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl border border-[#e5ebe5] bg-[#fafcf9] p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#568167]">
                  <TicketCheck size={15} /> Demo receipt
                </div>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#7a877d]">Reference</dt>
                    <dd
                      className="max-w-47.5 truncate font-medium text-[#344239]"
                      title={bookingReceipt.id}
                    >
                      {bookingReceipt.id}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#7a877d]">Location</dt>
                    <dd className="text-right font-medium text-[#344239]">
                      {bookingReceipt.location.name ?? location.name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#7a877d]">Court</dt>
                    <dd className="text-right font-medium text-[#344239]">
                      {bookingReceipt.court.name ?? selectedSlot?.courtName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#7a877d]">Date and time</dt>
                    <dd className="text-right font-medium text-[#344239]">
                      {dateLabel(bookingReceipt.date, timeZone)}
                      <br />
                      {bookingReceipt.startTime} – {bookingReceipt.endTime}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-[#e5ebe5] pt-3">
                    <dt className="font-semibold text-[#344239]">
                      Quoted total
                    </dt>
                    <dd className="font-semibold text-[#214a33]">
                      {bookingReceipt.price.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => setBookingOpen(false)}
                  className="h-10 w-full rounded-lg bg-[#1c5138] text-white hover:bg-[#17452f]"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-xl font-semibold">
                  Review your booking
                </DialogTitle>
                <DialogDescription>
                  Confirm the slot and review the quoted price before reserving.
                </DialogDescription>
              </DialogHeader>
              {selectedSlot && (
                <div className="rounded-xl border border-[#e5ebe5] bg-[#fafcf9] p-4">
                  <p className="font-semibold text-[#344239]">
                    {location.name} · {selectedSlot.courtName}
                  </p>
                  <p className="mt-2 text-sm text-[#6f7d73]">
                    {dateLabel(date, timeZone)} · {selectedSlot.slot.startTime}{" "}
                    – {selectedSlot.slot.endTime}
                  </p>
                  <p className="mt-1 text-sm text-[#6f7d73]">
                    {durationLabel(effectiveDuration)} session
                  </p>
                  <div className="mt-4 flex justify-between border-t border-[#e5ebe5] pt-3 text-sm">
                    <span className="font-semibold text-[#344239]">
                      Quoted total
                    </span>
                    <span className="font-semibold text-[#214a33]">
                      {selectedSlot.slot.price?.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
              <p className="rounded-lg bg-[#f5f3e8] px-3.5 py-3 text-xs leading-5 text-[#726b48]">
                Demo confirmation only: this creates a confirmed booking, but no
                payment is processed or collected.
              </p>
              {bookingError && (
                <p
                  role="alert"
                  className="rounded-lg border border-[#f1d4cc] bg-[#fff6f3] px-3.5 py-3 text-sm text-[#a4412d]"
                >
                  {bookingError}
                </p>
              )}
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="outline"
                  onClick={() => setBookingOpen(false)}
                  disabled={bookingSubmitting}
                  className="h-10 rounded-lg"
                >
                  Go back
                </Button>
                <Button
                  onClick={confirmBooking}
                  disabled={bookingSubmitting || !selectedSlot}
                  className="h-10 rounded-lg bg-[#1c5138] text-white hover:bg-[#17452f]"
                >
                  {bookingSubmitting ? "Confirming…" : "Confirm demo booking"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
