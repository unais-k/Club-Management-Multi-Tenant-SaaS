import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Clock3, MapPin, Search, Sparkles } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import {
  Busy,
  Empty,
  Field,
  inputClass,
  Notice,
  PageCard,
  PageTitle,
  selectClass,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";

type Location = {
  id: string;
  name: string;
  isActive: boolean;
  durations: number[];
};
type LocationPage = { data: Location[] };
type Plan = {
  id: string;
  name: string;
  isActive: boolean;
  prices: Array<{ durationMinutes: number; price: number }>;
};
type Slot = {
  startTime: string;
  endTime: string;
  price: number | null;
  prices?: Array<{
    membershipId: string;
    membershipName: string;
    price: number;
  }>;
  priceNote?: string;
  breakdown?: Array<{
    shiftName: string;
    startTime: string;
    endTime: string;
    price: number;
  }>;
};
type CourtSlots = { courtId: string; courtName: string; slots: Slot[] };
type AvailabilityResult = {
  locationId: string;
  locationName: string;
  date: string;
  dayOfWeek: number;
  durationMinutes: number;
  timezone: string;
  notice: string | null;
  pricing: {
    model: "SHIFT_BASED" | "MEMBERSHIP_BASED";
    membership: { id: string; name: string } | null;
    note: string | null;
  };
  courts: CourtSlots[];
};

function todayAt(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function prettyDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeZone,
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export function AvailabilityPage() {
  const { user } = useAuth();
  const timeZone = user?.club?.timezone || "Asia/Kolkata";
  const [locations, setLocations] = useState<Location[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(() => todayAt(timeZone));
  const [duration, setDuration] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const location = locations.find((item) => item.id === locationId);
  const planOptions = useMemo(
    () =>
      plans.filter(
        (plan) =>
          plan.isActive &&
          plan.prices.some(
            (price) => price.durationMinutes === Number(duration),
          ),
      ),
    [plans, duration],
  );
  const today = todayAt(timeZone);
  const maxDate = addDays(today, 60);

  useEffect(() => {
    let active = true;
    async function loadOptions() {
      setLoading(true);
      setError("");
      try {
        const locationResult = await apiRequest<LocationPage>(
          "/locations?page=1&limit=100",
        );
        const planResult =
          user?.club?.pricingModel === "MEMBERSHIP_BASED"
            ? await apiRequest<Plan[]>("/memberships")
            : [];
        if (!active) return;
        setLocations(locationResult.data);
        setPlans(planResult);
        setLocationId((current) =>
          locationResult.data.some((item) => item.id === current)
            ? current
            : (locationResult.data[0]?.id ?? ""),
        );
      } catch (err) {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load availability options",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadOptions();
    return () => {
      active = false;
    };
  }, [user?.club?.pricingModel]);

  useEffect(() => {
    if (!location) {
      setDuration("");
      return;
    }
    setDuration((current) =>
      location.durations.includes(Number(current))
        ? current
        : String(location.durations[0] ?? ""),
    );
  }, [location]);

  useEffect(() => {
    if (!planOptions.some((plan) => plan.id === membershipId))
      setMembershipId("");
  }, [planOptions, membershipId]);

  async function searchAvailability(event: FormEvent) {
    event.preventDefault();
    if (!location || !duration) return;
    setSearching(true);
    setError("");
    try {
      const query = new URLSearchParams({
        locationId: location.id,
        date,
        durationMinutes: duration,
      });
      if (membershipId) query.set("membershipId", membershipId);
      setResult(
        await apiRequest<AvailabilityResult>(
          `/availability?${query.toString()}`,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not retrieve available slots",
      );
    } finally {
      setSearching(false);
    }
  }

  const currency = (value: number) => `¤${value.toFixed(2)}`;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Availability"
        description="Check live bookable slots by location, date, duration, and pricing."
        action={
          <span className="hidden items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1.5 text-[10px] font-medium text-primary sm:inline-flex">
            <Sparkles className="size-3.5" />
            Booking-aware results
          </span>
        }
      />
      {error && <Notice error>{error}</Notice>}
      <PageCard>
        <form
          onSubmit={(event) => void searchAvailability(event)}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Field label="Location">
            <select
              required
              className={selectClass}
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                setResult(null);
              }}
              disabled={loading}
            >
              <option value="">Choose location</option>
              {locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" hint={`Club timezone: ${timeZone}`}>
            <input
              required
              type="date"
              min={today}
              max={maxDate}
              className={inputClass}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setResult(null);
              }}
            />
          </Field>
          <Field label="Duration">
            <select
              required
              className={selectClass}
              value={duration}
              onChange={(event) => {
                setDuration(event.target.value);
                setResult(null);
              }}
              disabled={!location}
            >
              <option value="">Choose duration</option>
              {location?.durations.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </Field>
          {user?.club?.pricingModel === "MEMBERSHIP_BASED" ? (
            <Field
              label="Preview plan"
              hint="Leave unselected to compare prices across all active plans."
            >
              <select
                className={selectClass}
                value={membershipId}
                onChange={(event) => {
                  setMembershipId(event.target.value);
                  setResult(null);
                }}
              >
                <option value="">All active plans</option>
                {planOptions.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={loading || searching || !locationId || !duration}
              >
                <Search className="size-4" />
                {searching ? "Checking…" : "Find availability"}
              </Button>
            </div>
          )}
          {user?.club?.pricingModel === "MEMBERSHIP_BASED" && (
            <div className="flex items-end sm:col-span-2 xl:col-span-1">
              <Button
                className="w-full"
                disabled={loading || searching || !locationId || !duration}
              >
                <Search className="size-4" />
                {searching ? "Checking…" : "Find availability"}
              </Button>
            </div>
          )}
        </form>
      </PageCard>
      {loading ? (
        <Busy label="Loading locations and pricing plans…" />
      ) : !locations.length ? (
        <Empty>Add a location before checking availability.</Empty>
      ) : (
        result && (
          <div className="space-y-4">
            <PageCard className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="size-4 text-primary" />
                  {result.locationName}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  {prettyDate(result.date, result.timezone)} ·{" "}
                  {result.durationMinutes} minutes
                </p>
              </div>
              <div className="rounded-lg bg-muted/45 px-3 py-2 text-right">
                <p className="text-[10px] text-muted-foreground">Pricing</p>
                <p className="mt-0.5 text-xs font-semibold">
                  {result.pricing.model === "SHIFT_BASED"
                    ? "Shift based"
                    : (result.pricing.membership?.name ??
                      "All membership plans")}
                </p>
              </div>
            </PageCard>
            {result.notice && <Notice>{result.notice}</Notice>}
            {result.pricing.note && <Notice>{result.pricing.note}</Notice>}
            {result.courts.length === 0 ? (
              <Empty>
                No active courts offer this duration at the selected location.
              </Empty>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {result.courts.map((court) => (
                  <PageCard key={court.courtId}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">
                          {court.courtName}
                        </h3>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {court.slots.length} available slot
                          {court.slots.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Clock3 className="size-4 text-primary" />
                    </div>
                    {court.slots.length ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {court.slots.map((slot) => (
                          <div
                            key={`${slot.startTime}-${slot.endTime}`}
                            className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3"
                          >
                            <p className="text-xs font-semibold text-emerald-900">
                              {slot.startTime}–{slot.endTime}
                            </p>
                            {slot.prices?.length ? (
                              <div className="mt-2 space-y-1 border-t border-emerald-500/15 pt-2">
                                {slot.prices.map((price) => (
                                  <p
                                    key={price.membershipId}
                                    className="text-[10px] text-muted-foreground"
                                  >
                                    <span className="font-medium">
                                      {price.membershipName}:
                                    </span>{" "}
                                    {currency(price.price)}
                                  </p>
                                ))}
                              </div>
                            ) : slot.price === null ? (
                              <p className="mt-1 text-[10px] text-amber-700">
                                Price unavailable
                              </p>
                            ) : (
                              <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                                {currency(slot.price)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty>
                        No slots available for this court on this date.
                      </Empty>
                    )}
                  </PageCard>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
