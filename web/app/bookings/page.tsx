"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Printer,
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

type Booking = {
  id: string;
  status: "CONFIRMED" | "CANCELLED";
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  price: number;
  pricingModel: string;
  membershipName: string | null;
  court: { id: string; name: string | null };
  location: { id: string; name: string | null };
  canCancel: boolean;
  cancelledAt: string | null;
  createdAt: string;
};
type BookingList = {
  data: Booking[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};
type ApiError = { message?: string | string[] };
type Profile = { club: { name: string; timezone: string } | null };

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const pageSize = 10;

async function apiMessage(response: Response) {
  const result = (await response.json().catch(() => ({}))) as ApiError;
  return Array.isArray(result.message)
    ? result.message.join(" ")
    : result.message;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function durationLabel(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;
}

export default function BookingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [period, setPeriod] = useState<"upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<BookingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState("");
  const [receiptToPrint, setReceiptToPrint] = useState<Booking | null>(null);
  const clearSession = useAuthStore((state) => state.clearSession);

  const loadBookings = useCallback(async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      window.location.assign("/");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [profileResponse, bookingsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
          `${apiBaseUrl}/bookings?period=${period}&page=${page}&limit=${pageSize}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      ]);
      if (!profileResponse.ok)
        throw new Error(
          (await apiMessage(profileResponse)) ||
            "Your session has ended. Please sign in again.",
        );
      if (!bookingsResponse.ok)
        throw new Error(
          (await apiMessage(bookingsResponse)) ||
            "We couldn’t load your bookings.",
        );
      const [user, bookings] = await Promise.all([
        profileResponse.json() as Promise<Profile>,
        bookingsResponse.json() as Promise<BookingList>,
      ]);
      setProfile(user);
      setList(bookings);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t load your bookings.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, period]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  async function cancelBooking() {
    if (!cancelTarget) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      window.location.assign("/");
      return;
    }
    setCancelling(true);
    setError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/bookings/${cancelTarget.id}/cancel`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok)
        throw new Error(
          (await apiMessage(response)) || "We couldn’t cancel this booking.",
        );
      const cancelled = (await response.json()) as Booking;
      setList((current) =>
        current
          ? {
              ...current,
              data: current.data.map((booking) =>
                booking.id === cancelled.id ? cancelled : booking,
              ),
            }
          : current,
      );
      setNotice(
        "Booking cancelled. This simulated flow does not issue refunds or payments.",
      );
      setCancelTarget(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t cancel this booking.",
      );
    } finally {
      setCancelling(false);
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
      window.location.assign("/");
    }
  }

  const timeZone = profile?.club?.timezone || "Asia/Kolkata";

  return (
    <>
      <main className="min-h-screen bg-[#f6f8f5] text-[#19251e] print:hidden">
        <header className="border-b border-[#e6ebe6] bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#173c2c] text-[#d4f36b]">
                <TicketCheck size={20} />
              </div>
              <div>
                <p className="font-heading text-base font-semibold">
                  CourtSide
                </p>
                <p className="text-xs text-[#859087]">
                  {profile?.club?.name ?? "Your club"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-[#526158] hover:bg-[#f2f5f1]"
              >
                <ArrowLeft size={15} className="mr-1.5" />
                Courts
              </Link>
              <Link
                href="/memberships"
                className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-[#526158] hover:bg-[#f2f5f1]"
              >
                Memberships
              </Link>
              <Button
                onClick={signOut}
                variant="outline"
                className="h-9 rounded-lg border-[#dfe6df] px-3 text-xs"
              >
                Sign out
              </Button>
            </div>
          </div>
        </header>
        <section className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
          <p className="mb-2 text-sm font-medium text-[#568167]">
            Your account
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-[-.035em] sm:text-4xl">
            My bookings
          </h1>
          <p className="mt-2 text-sm text-[#738077]">
            Keep track of your court reservations.
          </p>
          <div className="mt-7 grid grid-cols-2 rounded-xl bg-[#eaf0eb] p-1 sm:max-w-sm">
            {(["upcoming", "past"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setPeriod(value);
                  setPage(1);
                  setNotice("");
                }}
                className={`h-10 rounded-lg text-sm font-medium capitalize transition ${period === value ? "bg-white text-[#20352a] shadow-sm" : "text-[#748178] hover:text-[#20352a]"}`}
              >
                {value} bookings
              </button>
            ))}
          </div>
          {notice && (
            <p
              role="status"
              className="mt-4 rounded-xl border border-[#d8e8d8] bg-white px-4 py-3 text-sm text-[#34704a]"
            >
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
                onClick={() => void loadBookings()}
                variant="outline"
                className="h-8 shrink-0 rounded-lg text-xs"
              >
                <RefreshCw size={13} className="mr-1.5" />
                Retry
              </Button>
            </div>
          )}
          {loading && (
            <div className="mt-5 space-y-3">
              <div className="h-36 animate-pulse rounded-2xl bg-[#e9eee9]" />
              <div className="h-36 animate-pulse rounded-2xl bg-[#e9eee9]" />
            </div>
          )}
          {!loading && !error && list?.data.length === 0 && (
            <div className="mt-5 rounded-2xl border border-dashed border-[#d8e1d8] bg-white px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#edf3ed] text-[#568167]">
                <CalendarDays size={21} />
              </div>
              <h2 className="font-heading text-lg font-semibold">
                No {period} bookings
              </h2>
              <p className="mt-2 text-sm text-[#738077]">
                {period === "upcoming"
                  ? "Choose a court and find a time to play."
                  : "Completed and cancelled bookings will appear here."}
              </p>
              {period === "upcoming" && (
                <Link
                  href="/"
                  className="mt-5 inline-flex h-10 items-center rounded-lg bg-[#1c5138] px-4 text-sm font-medium text-white hover:bg-[#17452f]"
                >
                  Browse courts
                </Link>
              )}
            </div>
          )}
          {!loading && !error && list && list.data.length > 0 && (
            <div className="mt-5 space-y-3">
              {list.data.map((booking) => (
                <article
                  key={booking.id}
                  className="rounded-2xl border border-[#e4eae4] bg-white p-5 sm:p-6"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-heading text-lg font-semibold">
                          {booking.court.name ?? "Court"}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${booking.status === "CONFIRMED" ? "bg-[#e9f3ec] text-[#34704a]" : "bg-[#f2eeee] text-[#876565]"}`}
                        >
                          {booking.status === "CONFIRMED"
                            ? "Confirmed"
                            : "Cancelled"}
                        </span>
                      </div>
                      <p className="mt-2 flex items-center gap-2 text-sm text-[#6f7d73]">
                        <MapPin size={15} />
                        {booking.location.name ?? "Location unavailable"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-semibold text-[#344239]">
                          ${booking.price.toFixed(2)}
                        </p>
                        <p className="mt-1 text-xs text-[#89938b]">
                          {booking.membershipName
                            ? `${booking.membershipName} price`
                            : "Court price"}
                        </p>
                      </div>
                      {booking.canCancel && (
                        <Button
                          onClick={() => {
                            setCancelTarget(booking);
                            setError("");
                          }}
                          variant="outline"
                          className="h-9 rounded-lg border-[#e8d7d3] px-3 text-xs text-[#a4412d] hover:bg-[#fff6f3]"
                        >
                          Cancel booking
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#edf0ed] pt-4 text-xs text-[#718076]">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={14} />
                      {displayDate(booking.date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock3 size={14} />
                      {booking.startTime} – {booking.endTime} ·{" "}
                      {durationLabel(booking.durationMinutes)}
                    </span>
                    <span className="text-[#929d94]">
                      Club time · {timeZone}
                    </span>
                  </div>
                  <Button
                    onClick={() => {
                      setReceiptToPrint(booking);
                      window.setTimeout(() => window.print(), 100);
                    }}
                    variant="outline"
                    className="mt-3 h-9 rounded-lg px-3 text-xs"
                  >
                    <Printer size={14} className="mr-1.5" />
                    Print receipt
                  </Button>
                  <p className="mt-3 text-[10px] text-[#a0a9a1]">
                    Reference: {booking.id}
                  </p>
                </article>
              ))}
            </div>
          )}
          {!loading && !error && list && list.meta.totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-[#829087]">
                Page {list.meta.page} of {list.meta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  variant="outline"
                  className="h-9 rounded-lg px-3 text-xs"
                >
                  Previous
                </Button>
                <Button
                  onClick={() =>
                    setPage((current) =>
                      Math.min(list.meta.totalPages, current + 1),
                    )
                  }
                  disabled={page >= list.meta.totalPages}
                  variant="outline"
                  className="h-9 rounded-lg px-3 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </section>

        <Dialog
          open={cancelTarget !== null}
          onOpenChange={(open) => {
            if (!open && !cancelling) setCancelTarget(null);
          }}
        >
          <DialogContent className="rounded-2xl border-[#e3e9e3] p-6 sm:max-w-md">
            <DialogHeader>
              <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-[#fff2ef] text-[#a4412d]">
                <CheckCircle2 size={21} />
              </div>
              <DialogTitle className="font-heading text-xl font-semibold">
                Cancel this booking?
              </DialogTitle>
              <DialogDescription>
                This will release the slot for other members. The cancellation
                takes effect immediately.
              </DialogDescription>
            </DialogHeader>
            {cancelTarget && (
              <div className="rounded-xl bg-[#f7f9f6] p-4 text-sm">
                <p className="font-semibold text-[#344239]">
                  {cancelTarget.court.name ?? "Court"} ·{" "}
                  {cancelTarget.location.name ?? "Location"}
                </p>
                <p className="mt-2 text-[#738077]">
                  {displayDate(cancelTarget.date)} · {cancelTarget.startTime} –{" "}
                  {cancelTarget.endTime}
                </p>
                <p className="mt-1 text-xs text-[#89938b]">
                  Demo payment was not collected; no refund will be issued.
                </p>
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-[#f1d4cc] bg-[#fff6f3] px-3.5 py-3 text-sm text-[#a4412d]"
              >
                {error}
              </p>
            )}
            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setCancelTarget(null)}
                disabled={cancelling}
                className="h-10 rounded-lg"
              >
                Keep booking
              </Button>
              <Button
                onClick={cancelBooking}
                disabled={cancelling}
                className="h-10 rounded-lg bg-[#a4412d] text-white hover:bg-[#8e3928]"
              >
                {cancelling ? "Cancelling…" : "Confirm cancellation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      {receiptToPrint && (
        <>
          <style jsx global>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #booking-receipt-print,
              #booking-receipt-print * {
                visibility: visible !important;
              }
              #booking-receipt-print {
                position: absolute;
                inset: 0 auto auto 0;
                width: 100%;
                padding: 32px;
              }
            }
          `}</style>
          <section id="booking-receipt-print" className="hidden print:block">
            <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
              CourtSide · Booking receipt
            </p>
            <h1 className="mt-4 text-3xl font-bold">
              {receiptToPrint.court.name ?? "Court"}
            </h1>
            <p className="mt-1 text-gray-600">
              {receiptToPrint.location.name ?? "Location unavailable"}
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-5 text-sm">
              <div>
                <dt className="text-gray-500">Date</dt>
                <dd className="mt-1 font-medium">
                  {displayDate(receiptToPrint.date)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Time</dt>
                <dd className="mt-1 font-medium">
                  {receiptToPrint.startTime} – {receiptToPrint.endTime} (
                  {durationLabel(receiptToPrint.durationMinutes)})
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="mt-1 font-medium">{receiptToPrint.status}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Reference</dt>
                <dd className="mt-1 break-all font-medium">
                  {receiptToPrint.id}
                </dd>
              </div>
              <div className="col-span-2 border-t pt-4">
                <dt className="text-gray-500">
                  {receiptToPrint.membershipName
                    ? `${receiptToPrint.membershipName} package rate (included; no booking payment collected)`
                    : "Quoted court price (no payment collected)"}
                </dt>
                <dd className="mt-1 text-xl font-semibold">
                  ${receiptToPrint.price.toFixed(2)}
                </dd>
              </div>
            </dl>
            <p className="mt-8 border-t pt-4 text-xs text-gray-500">
              Demo receipt only. No payment was collected.
            </p>
          </section>
        </>
      )}
    </>
  );
}
