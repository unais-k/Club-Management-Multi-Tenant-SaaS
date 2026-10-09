import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coins,
  Eye,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";

type PricingModel = "SHIFT_BASED" | "MEMBERSHIP_BASED";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  pricingModel: PricingModel;
  isActive: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

interface TenantPage {
  data: Tenant[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface ScheduleRange {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface UnavailablePeriod {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string | null;
}

interface TenantOperations {
  tenant: Tenant;
  membershipPlans: Array<{
    id: string;
    name: string;
    description: string | null;
    validityDays: number;
    isActive: boolean;
    prices: Array<{ durationMinutes: number; price: number }>;
    missingDurations: number[];
  }>;
  dateRange: {
    today: string;
    through: string;
    days: number;
    dayOfWeek: number;
  };
  locations: Array<{
    id: string;
    name: string;
    address: string;
    isActive: boolean;
    durations: number[];
    openingHours: ScheduleRange[];
    todayUnavailablePeriods: UnavailablePeriod[];
    pricingShifts: Array<{
      id: string;
      name: string;
      startTime: string;
      endTime: string;
    }>;
    courts: Array<{
      id: string;
      name: string;
      description: string | null;
      isActive: boolean;
      durations: number[];
      usesLocationHours: boolean;
      openingHours: ScheduleRange[];
      prices: Array<{
        durationMinutes: number;
        shiftId: string | null;
        shiftName: string;
        price: number;
      }>;
    }>;
  }>;
  upcomingUnavailablePeriods: Array<
    UnavailablePeriod & { locationId: string; locationName: string }
  >;
}

interface CreateTenantInput {
  name: string;
  slug: string;
  pricingModel: PricingModel;
  timezone: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

interface UpdateTenantInput {
  name: string;
  timezone: string;
}

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; tenant: Tenant }
  | { kind: "details"; tenant: Tenant }
  | null;

const PAGE_SIZE = 10;
const emptyCreateForm: CreateTenantInput = {
  name: "",
  slug: "",
  pricingModel: "SHIFT_BASED",
  timezone: "Asia/Kolkata",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function pricingLabel(value: PricingModel) {
  return value === "SHIFT_BASED" ? "Shift based" : "Membership based";
}

function minuteOfDay(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeOfDay(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function todayWindows(
  hours: ScheduleRange[],
  dayOfWeek: number,
  blocked: UnavailablePeriod[],
) {
  let ranges = hours
    .filter((range) => range.dayOfWeek === dayOfWeek)
    .map((range) => ({
      start: minuteOfDay(range.startTime),
      end: minuteOfDay(range.endTime),
    }));

  for (const period of blocked) {
    const blockStart = minuteOfDay(period.startTime);
    const blockEnd = minuteOfDay(period.endTime);
    ranges = ranges.flatMap((range) => {
      const overlapStart = Math.max(range.start, blockStart);
      const overlapEnd = Math.min(range.end, blockEnd);
      if (overlapStart >= overlapEnd) return [range];
      const remainder: Array<{ start: number; end: number }> = [];
      if (range.start < overlapStart)
        remainder.push({ start: range.start, end: overlapStart });
      if (overlapEnd < range.end)
        remainder.push({ start: overlapEnd, end: range.end });
      return remainder;
    });
  }

  return ranges.map(
    (range) => `${timeOfDay(range.start)}–${timeOfDay(range.end)}`,
  );
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function Modal({
  title,
  description,
  onClose,
  children,
  width = "max-w-xl",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="tenant-modal-title"
        aria-modal="true"
        className={`my-auto w-full ${width} rounded-2xl border border-border bg-background shadow-2xl`}
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2
              id="tenant-modal-title"
              className="font-montserrat text-lg font-semibold tracking-tight"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-1 size-8"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && (
        <span className="block text-[11px] leading-4 text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/65 focus:border-ring focus:ring-2 focus:ring-ring/20";

function ErrorMessage({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs leading-5 text-destructive"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}
    >
      <span
        className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function ScheduleSummary({ data }: { data: TenantOperations }) {
  return (
    <div className="space-y-6 border-t border-border pt-5">
      {data.tenant.pricingModel === "MEMBERSHIP_BASED" && (
        <section>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Coins className="size-4 text-primary" />
                Membership plan pricing
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Plans and court-session prices configured by this club.
              </p>
            </div>
            <span className="mt-2 w-fit rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground sm:mt-0">
              Prices by duration · club-wide
            </span>
          </div>
          {data.membershipPlans.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              No membership plans have been created for this club yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.membershipPlans.map((plan) => (
                <article
                  key={plan.id}
                  className="rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-xs font-semibold">
                        {plan.name}
                      </h4>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Valid for {plan.validityDays} days
                      </p>
                    </div>
                    <StatusBadge active={plan.isActive} />
                  </div>
                  {plan.description && (
                    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {plan.prices.map((price) => (
                      <span
                        key={`${plan.id}-${price.durationMinutes}`}
                        className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground"
                      >
                        {price.durationMinutes} min ·{" "}
                        <span className="font-bold tracking-wide">
                          ${price.price.toFixed(2)}
                        </span>
                      </span>
                    ))}
                    {plan.prices.length === 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        No duration prices configured.
                      </span>
                    )}
                  </div>
                  {plan.missingDurations.length > 0 && (
                    <p className="mt-2 text-[10px] text-amber-800">
                      Missing prices for:{" "}
                      {plan.missingDurations
                        .map((duration) => `${duration} min`)
                        .join(", ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="size-4 text-primary" />
              Today’s scheduled openings
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {displayDate(data.dateRange.today)} · {data.tenant.timezone}
            </p>
          </div>
          <span className="mt-2 w-fit rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-800 sm:mt-0">
            Hours minus location closures · bookings not included
          </span>
        </div>

        {data.locations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            No locations have been added to this club yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {data.locations.map((location, index) => {
              const locationWindows = location.isActive
                ? todayWindows(
                    location.openingHours,
                    data.dateRange.dayOfWeek,
                    location.todayUnavailablePeriods,
                  )
                : [];
              return (
                <details
                  key={location.id}
                  open={index === 0}
                  className="group rounded-xl border border-border bg-background"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <MapPin className="size-3.5 text-muted-foreground" />
                        {location.name}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                        {location.address}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge active={location.isActive} />
                      <span className="text-muted-foreground transition-transform group-open:rotate-180">
                        ⌄
                      </span>
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Location open hours today
                      </p>
                      {locationWindows.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {locationWindows.map((window) => (
                            <span
                              key={window}
                              className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800"
                            >
                              {window}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {location.isActive
                            ? "Closed today"
                            : "Location inactive"}
                        </p>
                      )}
                    </div>

                    {location.todayUnavailablePeriods.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Location closures today
                        </p>
                        <div className="mt-2 space-y-1.5">
                          {location.todayUnavailablePeriods.map((period) => (
                            <p
                              key={period.id}
                              className="flex flex-wrap items-center gap-x-2 text-[11px] text-amber-800"
                            >
                              <span className="font-semibold">
                                {period.startTime}–{period.endTime}
                              </span>
                              <span>
                                {period.reason || "Unavailable period"}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Court schedule windows
                      </p>
                      {location.courts.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No courts have been added to this location.
                        </p>
                      ) : (
                        <div className="mt-2 divide-y divide-border rounded-lg border border-border">
                          {location.courts.map((court) => {
                            const hours = court.usesLocationHours
                              ? location.openingHours
                              : court.openingHours;
                            const windows =
                              location.isActive && court.isActive
                                ? todayWindows(
                                    hours,
                                    data.dateRange.dayOfWeek,
                                    location.todayUnavailablePeriods,
                                  )
                                : [];
                            return (
                              <div
                                key={court.id}
                                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-medium">
                                    {court.name}
                                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                                      {court.usesLocationHours
                                        ? "Follows location hours"
                                        : "Custom hours"}
                                    </span>
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {court.durations.map((duration) => (
                                      <span
                                        key={duration}
                                        className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                                      >
                                        {duration} min
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                                  {!location.isActive || !court.isActive ? (
                                    <span className="text-[10px] text-muted-foreground">
                                      Inactive
                                    </span>
                                  ) : windows.length ? (
                                    windows.map((window) => (
                                      <span
                                        key={window}
                                        className="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-800"
                                      >
                                        {window}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">
                                      Closed today
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {data.tenant.pricingModel === "SHIFT_BASED" && (
                      <div>
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <Coins className="size-3.5" />
                          Pricing setup
                        </p>
                        {location.pricingShifts.length > 0 && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            Shifts:{" "}
                            {location.pricingShifts
                              .map(
                                (shift) =>
                                  `${shift.name} ${shift.startTime}–${shift.endTime}`,
                              )
                              .join(" · ")}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {location.courts.flatMap((court) =>
                            court.prices.map((price) => (
                              <span
                                key={`${court.id}-${price.durationMinutes}-${price.shiftId ?? "normal"}`}
                                className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground"
                              >
                                {court.name} · {price.durationMinutes} min ·{" "}
                                {price.shiftName} · {price.price.toFixed(2)}
                              </span>
                            )),
                          )}
                          {location.courts.every(
                            (court) => court.prices.length === 0,
                          ) && (
                            <span className="text-[10px] text-muted-foreground">
                              No court prices configured yet.
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" />
          Upcoming location closures
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          The next six days after today, through{" "}
          {displayDate(data.dateRange.through)}.
        </p>
        {data.upcomingUnavailablePeriods.length ? (
          <div className="mt-3 divide-y divide-border rounded-xl border border-border">
            {data.upcomingUnavailablePeriods.map((period) => (
              <div
                key={period.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium">{period.locationName}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {period.reason || "Unavailable period"}
                  </p>
                </div>
                <p className="shrink-0 text-[11px] font-medium text-amber-800">
                  {displayDate(period.date)} · {period.startTime}–
                  {period.endTime}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
            No location closures are scheduled in the coming six days.
          </p>
        )}
      </section>
    </div>
  );
}

export function ClubsPage() {
  const [result, setResult] = useState<TenantPage>({
    data: [],
    meta: { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 },
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [createForm, setCreateForm] =
    useState<CreateTenantInput>(emptyCreateForm);
  const [editForm, setEditForm] = useState<UpdateTenantInput>({
    name: "",
    timezone: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyTenantId, setBusyTenantId] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [operations, setOperations] = useState<TenantOperations | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState("");
  const [operationsReload, setOperationsReload] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (debouncedSearch) query.set("search", debouncedSearch);

    setIsLoading(true);
    setLoadError("");
    apiRequest<TenantPage>(`/tenants?${query}`, { signal: controller.signal })
      .then(setResult)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not load clubs.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [page, debouncedSearch, refreshKey]);

  const detailsTenantId = dialog?.kind === "details" ? dialog.tenant.id : "";
  useEffect(() => {
    if (!detailsTenantId) {
      setOperations(null);
      setOperationsError("");
      return;
    }

    const controller = new AbortController();
    setOperations(null);
    setOperationsError("");
    setOperationsLoading(true);
    apiRequest<TenantOperations>(`/tenants/${detailsTenantId}/operations`, {
      signal: controller.signal,
    })
      .then(setOperations)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setOperationsError(
            error instanceof Error
              ? error.message
              : "Could not load this club’s schedule.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOperationsLoading(false);
      });

    return () => controller.abort();
  }, [detailsTenantId, operationsReload]);

  function openCreate() {
    setCreateForm(emptyCreateForm);
    setSlugEdited(false);
    setFormError("");
    setDialog({ kind: "create" });
  }

  function openEdit(tenant: Tenant) {
    setEditForm({ name: tenant.name, timezone: tenant.timezone });
    setFormError("");
    setDialog({ kind: "edit", tenant });
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFormError("");
    try {
      await apiRequest<Tenant>("/tenants", {
        method: "POST",
        body: JSON.stringify({ ...createForm, slug: createForm.slug.trim() }),
      });
      setDialog(null);
      setPage(1);
      setRefreshKey((value) => value + 1);
      setNotice({ text: `${createForm.name} was created.`, isError: false });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not create the club.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.kind !== "edit") return;
    setIsSaving(true);
    setFormError("");
    try {
      const updated = await apiRequest<Tenant>(`/tenants/${dialog.tenant.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      setDialog(null);
      setResult((current) => ({
        ...current,
        data: current.data.map((club) =>
          club.id === updated.id ? updated : club,
        ),
      }));
      setNotice({ text: `${updated.name} was updated.`, isError: false });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not update the club.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus(tenant: Tenant) {
    setBusyTenantId(tenant.id);
    setNotice(null);
    try {
      const updated = await apiRequest<Tenant>(`/tenants/${tenant.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !tenant.isActive }),
      });
      setResult((current) => ({
        ...current,
        data: current.data.map((club) =>
          club.id === updated.id ? updated : club,
        ),
      }));
      setNotice({
        text: `${updated.name} is now ${updated.isActive ? "active" : "inactive"}.`,
        isError: false,
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "Could not update club status.",
        isError: true,
      });
    } finally {
      setBusyTenantId("");
    }
  }

  const totalPages = result.meta.totalPages || 1;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <Building2 className="size-4.5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Club directory</p>
            <p className="text-xs text-muted-foreground">
              {result.meta.total} {result.meta.total === 1 ? "club" : "clubs"}{" "}
              on the platform
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 size-4" /> Add club
        </Button>
      </section>

      {notice && (
        <div
          role={notice.isError ? "alert" : "status"}
          className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-xs ${notice.isError ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-emerald-600/20 bg-emerald-500/5 text-emerald-800"}`}
        >
          <span>{notice.text}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice(null)}>
            <X className="size-4" />
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-sm font-semibold">All clubs</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Search and manage platform tenants.
            </p>
          </div>
          <label className="relative block w-full sm:max-w-70">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              aria-label="Search clubs by name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search clubs…"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </label>
        </div>

        {loadError ? (
          <div className="p-8 text-center">
            <ErrorMessage>{loadError}</ErrorMessage>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-205 border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-5 py-3">Club</th>
                  <th className="px-4 py-3">Pricing model</th>
                  <th className="px-4 py-3">Timezone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="h-36 text-center text-xs text-muted-foreground"
                    >
                      <LoaderCircle className="mr-2 inline size-4 animate-spin" />
                      Loading clubs…
                    </td>
                  </tr>
                ) : result.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <Building2 className="size-5" />
                      </span>
                      <p className="text-sm font-medium">
                        {debouncedSearch ? "No clubs found" : "No clubs yet"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {debouncedSearch
                          ? "Try a different search."
                          : "Add your first club to get started."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  result.data.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className="transition-colors hover:bg-muted/20"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-semibold text-violet-700">
                            {tenant.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold">
                              {tenant.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                              {tenant.slug}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        {pricingLabel(tenant.pricingModel)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="size-3.5" />
                          {tenant.timezone}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge active={tenant.isActive} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {formatDate(tenant.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="View club"
                            aria-label={`View ${tenant.name}`}
                            onClick={() =>
                              setDialog({ kind: "details", tenant })
                            }
                          >
                            <Eye />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Edit club"
                            aria-label={`Edit ${tenant.name}`}
                            onClick={() => openEdit(tenant)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`size-8 ${tenant.isActive ? "text-muted-foreground hover:text-destructive" : "text-emerald-700 hover:text-emerald-800"}`}
                            title={
                              tenant.isActive
                                ? "Deactivate club"
                                : "Activate club"
                            }
                            aria-label={`${tenant.isActive ? "Deactivate" : "Activate"} ${tenant.name}`}
                            disabled={busyTenantId === tenant.id}
                            onClick={() => void toggleStatus(tenant)}
                          >
                            {busyTenantId === tenant.id ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <Power />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loadError && result.meta.total > 0 && (
          <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-[11px] text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, result.meta.total)} of{" "}
              {result.meta.total}
            </p>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="mr-1 text-[11px] text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        )}
      </section>

      {dialog?.kind === "create" && (
        <Modal
          title="Create a club"
          description="Set up the club and its first club administrator."
          onClose={() => setDialog(null)}
        >
          <form
            className="max-h-[calc(100vh-150px)] space-y-5 overflow-y-auto px-6 py-5"
            onSubmit={createTenant}
          >
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Club name">
                <input
                  className={inputClass}
                  required
                  maxLength={150}
                  value={createForm.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setCreateForm((form) => ({
                      ...form,
                      name,
                      ...(!slugEdited ? { slug: slugify(name) } : {}),
                    }));
                  }}
                  placeholder="Downtown Sports Club"
                />
              </Field>
              <Field
                label="Club slug"
                hint="Lowercase letters, numbers, and single hyphens."
              >
                <input
                  className={inputClass}
                  required
                  maxLength={100}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={createForm.slug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setCreateForm((form) => ({
                      ...form,
                      slug: event.target.value,
                    }));
                  }}
                  placeholder="downtown-sports"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pricing model">
                <select
                  className={inputClass}
                  value={createForm.pricingModel}
                  onChange={(event) =>
                    setCreateForm((form) => ({
                      ...form,
                      pricingModel: event.target.value as PricingModel,
                    }))
                  }
                >
                  <option value="SHIFT_BASED">Shift based</option>
                  <option value="MEMBERSHIP_BASED">Membership based</option>
                </select>
              </Field>
              <Field
                label="Timezone"
                hint="Use an IANA timezone, such as Asia/Kolkata."
              >
                <input
                  className={inputClass}
                  required
                  maxLength={60}
                  value={createForm.timezone}
                  onChange={(event) =>
                    setCreateForm((form) => ({
                      ...form,
                      timezone: event.target.value,
                    }))
                  }
                  placeholder="Asia/Kolkata"
                />
              </Field>
            </div>
            <div className="border-t border-border pt-5">
              <p className="mb-4 text-xs font-semibold">
                First club administrator
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Administrator name">
                  <input
                    className={inputClass}
                    required
                    maxLength={150}
                    value={createForm.adminName}
                    onChange={(event) =>
                      setCreateForm((form) => ({
                        ...form,
                        adminName: event.target.value,
                      }))
                    }
                    placeholder="Club owner"
                  />
                </Field>
                <Field label="Administrator email">
                  <input
                    className={inputClass}
                    required
                    type="email"
                    maxLength={190}
                    value={createForm.adminEmail}
                    onChange={(event) =>
                      setCreateForm((form) => ({
                        ...form,
                        adminEmail: event.target.value,
                      }))
                    }
                    placeholder="owner@club.com"
                  />
                </Field>
                <Field label="Temporary password" hint="At least 8 characters.">
                  <input
                    className={inputClass}
                    required
                    type="password"
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    value={createForm.adminPassword}
                    onChange={(event) =>
                      setCreateForm((form) => ({
                        ...form,
                        adminPassword: event.target.value,
                      }))
                    }
                    placeholder="Create a password"
                  />
                </Field>
              </div>
            </div>
            <footer className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                )}
                {isSaving ? "Creating…" : "Create club"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {dialog?.kind === "edit" && (
        <Modal
          title="Edit club"
          description="Update the club name or timezone."
          onClose={() => setDialog(null)}
          width="max-w-lg"
        >
          <form className="space-y-5 px-6 py-5" onSubmit={updateTenant}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <Field label="Club name">
              <input
                className={inputClass}
                required
                maxLength={150}
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </Field>
            <Field
              label="Timezone"
              hint="Use an IANA timezone, such as Asia/Kolkata."
            >
              <input
                className={inputClass}
                required
                maxLength={60}
                value={editForm.timezone}
                onChange={(event) =>
                  setEditForm((form) => ({
                    ...form,
                    timezone: event.target.value,
                  }))
                }
              />
            </Field>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Slug and pricing model are fixed when a club is created.
            </p>
            <footer className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                )}
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {dialog?.kind === "details" && (
        <Modal
          title={dialog.tenant.name}
          description="Club details and current operations"
          onClose={() => setDialog(null)}
          width="max-w-4xl"
        >
          <div className="max-h-[calc(100vh-145px)] space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex items-center justify-between rounded-xl bg-muted/45 p-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Account status
                </p>
                <p className="mt-1 text-sm font-medium">
                  {dialog.tenant.isActive
                    ? "Club is active"
                    : "Club is inactive"}
                </p>
              </div>
              <StatusBadge active={dialog.tenant.isActive} />
            </div>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-5">
              {[
                ["Slug", dialog.tenant.slug],
                ["Pricing model", pricingLabel(dialog.tenant.pricingModel)],
                ["Timezone", dialog.tenant.timezone],
                ["Created", formatDate(dialog.tenant.createdAt)],
                ["Last updated", formatDate(dialog.tenant.updatedAt)],
                ["Club ID", dialog.tenant.id],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 break-all text-xs font-medium">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {operationsLoading && (
              <div className="flex items-center justify-center gap-2 border-t border-border py-8 text-xs text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Loading
                locations, hours, and pricing…
              </div>
            )}
            {operationsError && (
              <div className="border-t border-border pt-5">
                <ErrorMessage>{operationsError}</ErrorMessage>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setOperationsReload((value) => value + 1)}
                >
                  Retry
                </Button>
              </div>
            )}
            {operations && <ScheduleSummary data={operations} />}
            <footer className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => openEdit(dialog.tenant)}>
                <Pencil className="mr-2 size-4" />
                Edit club
              </Button>
              <Button onClick={() => setDialog(null)}>
                <Check className="mr-2 size-4" />
                Done
              </Button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
}
