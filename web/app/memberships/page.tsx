"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Clock3,
  Printer,
  RefreshCw,
  TicketCheck,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore, type AuthUser } from "@/store/auth-store";

type PaymentReceipt = {
  id: string;
  receiptNumber: string;
  amount: number;
  status: "PENDING" | "SIMULATED_PAID";
  method: "DEMO" | null;
  paidAt: string | null;
  simulated: boolean;
};
type MembershipRecord = {
  id: string;
  status:
    | "ACTIVE"
    | "SCHEDULED"
    | "PENDING_PAYMENT"
    | "EXHAUSTED"
    | "EXPIRED"
    | "CANCELLED";
  startsAt: string;
  expiresAt: string;
  daysLeft: number;
  packageFee: number | null;
  package: {
    validityDays: number;
    bookingDurationMinutes: number;
    includedBookings: number;
    pricePerBooking: number;
  } | null;
  bookingsUsed: number | null;
  bookingsRemaining: number | null;
  payment: PaymentReceipt | null;
  membership: {
    id: string;
    name: string;
    description: string | null;
    validityDays: number;
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
  current: MembershipRecord | null;
  scheduled: MembershipRecord[];
  pendingPayment: MembershipRecord[];
  history: MembershipRecord[];
};

const emptyMemberships: MyMembershipsResponse = {
  current: null,
  scheduled: [],
  pendingPayment: [],
  history: [],
};
const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

async function readError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as ApiError;
  return Array.isArray(data.message) ? data.message.join(" ") : data.message;
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;
}

function formatMoney(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export default function MembershipsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] =
    useState<MyMembershipsResponse>(emptyMemberships);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptToPrint, setReceiptToPrint] = useState<MembershipRecord | null>(
    null,
  );
  const clearSession = useAuthStore((state) => state.clearSession);

  const loadPageData = useCallback(async (token: string) => {
    const [profileResponse, membershipsResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/auth/me`, {
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
    if (!membershipsResponse.ok)
      throw new Error(
        (await readError(membershipsResponse)) ||
          "We couldn’t load your membership details.",
      );

    const [user, data] = await Promise.all([
      profileResponse.json() as Promise<Profile>,
      membershipsResponse.json() as Promise<MyMembershipsResponse>,
    ]);
    setProfile(user);
    setMemberships({ ...emptyMemberships, ...data });
  }, []);

  const refresh = useCallback(async () => {
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
          : "We couldn’t load your membership details.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadPageData, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const clearPrintState = () => setReceiptToPrint(null);
    window.addEventListener("afterprint", clearPrintState);
    return () => window.removeEventListener("afterprint", clearPrintState);
  }, []);

  async function confirmDemoPayment(record: MembershipRecord) {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      router.replace("/");
      return;
    }
    setPayingId(record.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/me/membership/${record.id}/confirm-demo-payment`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        membership?: MembershipRecord;
      } & ApiError;
      if (!response.ok)
        throw new Error(
          (Array.isArray(result.message)
            ? result.message.join(" ")
            : result.message) || "We couldn’t confirm the demo payment.",
        );

      await loadPageData(token);
      if (result.membership) {
        setReceiptToPrint(result.membership);
        window.setTimeout(() => window.print(), 150);
      }
      setNotice("Demo payment recorded. No money was collected.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t confirm the demo payment.",
      );
    } finally {
      setPayingId(null);
    }
  }

  function printReceipt(record: MembershipRecord) {
    setReceiptToPrint(record);
    window.setTimeout(() => window.print(), 150);
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

  const timeZone = profile?.club?.timezone || "Asia/Kolkata";
  const allRecords = [
    ...memberships.pendingPayment,
    ...(memberships.current ? [memberships.current] : []),
    ...memberships.scheduled,
    ...memberships.history,
  ];

  return (
    <>
      <main className="min-h-screen bg-[#f6f8f5] text-[#19251e] print:hidden">
        <header className="border-b border-[#e6ebe6] bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#173c2c] text-[#d4f36b]">
                <Trophy size={20} />
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
                Bookings &amp; receipts
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

        <section className="mx-auto max-w-4xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
          <p className="mb-2 text-sm font-medium text-[#568167]">
            {profile?.club?.name ?? "Your club"}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-3xl font-semibold tracking-[-.035em] sm:text-4xl">
                Membership &amp; receipts
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#738077]">
                Review your assigned package, booking credits, and payment
                receipts. Membership packages are assigned by the club.
              </p>
            </div>
            <Button
              onClick={() => void refresh()}
              variant="outline"
              className="h-9 rounded-lg border-[#dfe6df] text-xs"
              disabled={loading}
            >
              <RefreshCw size={13} className="mr-1.5" />
              Refresh
            </Button>
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
                onClick={() => void refresh()}
                variant="outline"
                className="h-8 shrink-0 rounded-lg text-xs"
              >
                <RefreshCw size={13} className="mr-1.5" />
                Retry
              </Button>
            </div>
          )}

          {loading ? (
            <div className="mt-8 h-44 animate-pulse rounded-2xl bg-[#e9eee9]" />
          ) : profile?.club?.pricingModel === "SHIFT_BASED" ? (
            <section className="mt-8 rounded-2xl border border-[#dce8dc] bg-white p-6">
              <h2 className="font-heading text-lg font-semibold">
                Memberships aren’t used at this club
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#738077]">
                This club uses time based court pricing. Your booking records
                and printable booking receipts are available in Bookings.
              </p>
              <Button
                render={<Link href="/bookings" />}
                nativeButton={false}
                className="mt-4 rounded-xl bg-[#1c5138] text-white"
              >
                Open bookings
              </Button>
            </section>
          ) : (
            <>
              {memberships.pendingPayment.length > 0 && (
                <section className="mt-8">
                  <h2 className="mb-3 font-heading text-lg font-semibold">
                    Waiting for payment
                  </h2>
                  <div className="space-y-3">
                    {memberships.pendingPayment.map((record) => (
                      <MembershipCard
                        key={record.id}
                        record={record}
                        timeZone={timeZone}
                        onPrint={printReceipt}
                        action={
                          <Button
                            onClick={() => void confirmDemoPayment(record)}
                            disabled={payingId !== null}
                            className="h-10 rounded-xl bg-[#1c5138] text-sm font-semibold text-white hover:bg-[#17452f]"
                          >
                            {payingId === record.id
                              ? "Recording…"
                              : `Confirm demo payment · ${formatMoney(record.packageFee ?? record.payment?.amount ?? 0)}`}
                          </Button>
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              {memberships.current && (
                <section className="mt-8">
                  <h2 className="mb-3 font-heading text-lg font-semibold">
                    Current package
                  </h2>
                  <MembershipCard
                    record={memberships.current}
                    timeZone={timeZone}
                    onPrint={printReceipt}
                  />
                </section>
              )}

              {memberships.scheduled.length > 0 && (
                <section className="mt-8">
                  <h2 className="mb-3 font-heading text-lg font-semibold">
                    Scheduled packages
                  </h2>
                  <div className="space-y-3">
                    {memberships.scheduled.map((record) => (
                      <MembershipCard
                        key={record.id}
                        record={record}
                        timeZone={timeZone}
                        onPrint={printReceipt}
                      />
                    ))}
                  </div>
                </section>
              )}

              {memberships.pendingPayment.length === 0 &&
                !memberships.current &&
                memberships.scheduled.length === 0 && (
                  <section className="mt-8 rounded-2xl border border-dashed border-[#d8e1d8] bg-white px-6 py-12 text-center">
                    <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#edf3ed] text-[#568167]">
                      <BadgeCheck size={21} />
                    </div>
                    <h2 className="font-heading text-lg font-semibold">
                      No assigned package yet
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#738077]">
                      Your Club Admin manages membership packages. Once one is
                      assigned to you, it will appear here for demo checkout.
                    </p>
                  </section>
                )}

              {memberships.history.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-3 font-heading text-lg font-semibold">
                    Membership history &amp; receipts
                  </h2>
                  <div className="space-y-3">
                    {memberships.history.map((record) => (
                      <MembershipCard
                        key={record.id}
                        record={record}
                        timeZone={timeZone}
                        onPrint={printReceipt}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <div className="mt-8 rounded-xl border border-[#e3e9e3] bg-white px-4 py-3 text-sm text-[#738077]">
            <CalendarDays
              size={15}
              className="mr-2 inline-block text-[#568167]"
            />
            Need your court booking history?{" "}
            <Link
              href="/bookings"
              className="font-semibold text-[#1c5138] underline"
            >
              View bookings and receipts
            </Link>
          </div>
        </section>
      </main>

      {receiptToPrint?.payment?.status === "SIMULATED_PAID" && (
        <section
          id="membership-payment-receipt"
          className="hidden bg-white p-10 text-[#19251e] print:block"
        >
          <div className="mx-auto max-w-xl border border-[#d9e1d9] p-8">
            <div className="flex items-center gap-3 border-b border-[#e5ebe5] pb-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#173c2c] text-[#d4f36b] print:bg-[#173c2c]">
                <TicketCheck size={19} />
              </div>
              <div>
                <p className="font-heading text-lg font-semibold">CourtSide</p>
                <p className="text-xs text-[#738077]">
                  {profile?.club?.name ?? "Club"} · Demo payment receipt
                </p>
              </div>
            </div>
            <h1 className="mt-6 text-xl font-semibold">
              Membership package receipt
            </h1>
            <dl className="mt-5 space-y-3 text-sm">
              <ReceiptLine
                label="Receipt"
                value={receiptToPrint.payment.receiptNumber}
              />
              <ReceiptLine label="Member" value={profile?.name ?? "Consumer"} />
              <ReceiptLine
                label="Package"
                value={receiptToPrint.membership?.name ?? "Membership"}
              />
              <ReceiptLine
                label="Validity"
                value={`${receiptToPrint.package?.validityDays ?? 0} days`}
              />
              <ReceiptLine
                label="Booking duration"
                value={formatDuration(
                  receiptToPrint.package?.bookingDurationMinutes ?? 0,
                )}
              />
              <ReceiptLine
                label="Included bookings"
                value={String(receiptToPrint.package?.includedBookings ?? 0)}
              />
              <ReceiptLine
                label="Payment status"
                value="Simulated · no money collected"
              />
              <ReceiptLine
                label="Date"
                value={
                  receiptToPrint.payment.paidAt
                    ? formatDate(receiptToPrint.payment.paidAt, timeZone)
                    : "—"
                }
              />
            </dl>
            <div className="mt-5 flex justify-between border-t border-[#e5ebe5] pt-4 text-base font-semibold">
              <span>Package fee</span>
              <span>{formatMoney(receiptToPrint.payment.amount)}</span>
            </div>
            <p className="mt-6 text-xs leading-5 text-[#738077]">
              This is a demo receipt for development and testing. No payment
              provider was used and no money was collected.
            </p>
          </div>
        </section>
      )}
    </>
  );
}

function MembershipCard({
  record,
  timeZone,
  onPrint,
  action,
}: {
  record: MembershipRecord;
  timeZone: string;
  onPrint: (record: MembershipRecord) => void;
  action?: ReactNode;
}) {
  const statusLabel =
    record.status === "EXHAUSTED"
      ? "Quota used"
      : record.status === "SCHEDULED"
        ? "Scheduled"
        : record.status === "PENDING_PAYMENT"
          ? "Pending payment"
          : record.status === "ACTIVE"
            ? "Active"
            : record.status.charAt(0) + record.status.slice(1).toLowerCase();
  const paid = record.payment?.status === "SIMULATED_PAID";

  return (
    <article className="rounded-2xl border border-[#dce8dc] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#e9f3ec] text-[#24704d]">
            <BadgeCheck size={19} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">
              {record.membership?.name ?? "Membership package"}
            </h3>
            <p className="mt-1 text-xs text-[#738077]">
              {record.package
                ? `${record.package.validityDays} days · ${formatDuration(record.package.bookingDurationMinutes)} bookings`
                : "Package details unavailable"}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[#e9f3ec] px-2.5 py-1 text-[10px] font-semibold text-[#34704a]">
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 border-t border-[#edf0ed] pt-4 text-sm sm:grid-cols-2">
        <Info
          label="Package fee"
          value={formatMoney(record.packageFee ?? record.payment?.amount ?? 0)}
        />
        <Info
          label="Credits remaining"
          value={
            record.bookingsRemaining === null
              ? "—"
              : `${record.bookingsRemaining} of ${record.package?.includedBookings ?? 0}`
          }
        />
        {record.package && (
          <Info
            label="Rate per booking"
            value={formatMoney(record.package.pricePerBooking)}
          />
        )}
        <Info
          label={record.status === "SCHEDULED" ? "Starts" : "Valid until"}
          value={formatDate(
            record.status === "SCHEDULED" ? record.startsAt : record.expiresAt,
            timeZone,
          )}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-[#7c887f]">
          <Clock3 size={14} />
          {record.status === "ACTIVE"
            ? `${record.daysLeft} days remaining · ${record.bookingsUsed ?? 0} bookings used`
            : record.status === "SCHEDULED"
              ? `Begins ${formatDate(record.startsAt, timeZone)}`
              : record.payment?.status === "PENDING"
                ? "Complete the demo checkout to activate this package"
                : statusLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {paid && (
            <Button
              variant="outline"
              onClick={() => onPrint(record)}
              className="h-9 rounded-lg border-[#dfe6df] text-xs"
            >
              <Printer size={14} className="mr-1.5" />
              Print receipt
            </Button>
          )}
          {action}
        </div>
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[#89938b]">{label}</p>
      <p className="mt-1 font-medium text-[#344239]">{value}</p>
    </div>
  );
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#738077]">{label}</dt>
      <dd className="text-right font-medium text-[#344239]">{value}</dd>
    </div>
  );
}
