import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  BadgeCheck,
  Clock3,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Busy,
  Empty,
  Field,
  inputClass,
  Notice,
  PageCard,
  PageTitle,
  selectClass,
  textAreaClass,
} from "@/components/admin-ui";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  validityDays: number;
  isActive: boolean;
};
type PackageOption = {
  id: string;
  membershipId: string;
  validityDays: number;
  bookingDurationMinutes: number;
  includedBookings: number;
  pricePerBooking: number;
  packageFee: number;
  isActive: boolean;
  assignmentCount?: number;
};
type Location = { id: string; durations: number[] };
type Consumer = { id: string; name: string; email: string };
type Assignment = {
  id: string;
  userId: string;
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
  bookingsUsed: number | null;
  bookingsRemaining: number | null;
  package: PackageOption | null;
  payment: {
    status: "PENDING" | "SIMULATED_PAID";
    amount: number;
    paidAt: string | null;
  } | null;
  consumer: Consumer | null;
  membership: { id: string; name: string } | null;
};
type Page<T> = { data: T[] };

const emptyPackage = {
  validityDays: "30",
  bookingDurationMinutes: "30",
  includedBookings: "24",
  pricePerBooking: "50",
};

function money(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function MembershipsPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [packages, setPackages] = useState<Record<string, PackageOption[]>>({});
  const [durations, setDurations] = useState<number[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [packageFormPlanId, setPackageFormPlanId] = useState<string | null>(
    null,
  );
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [packageDraft, setPackageDraft] = useState(emptyPackage);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [consumerSearch, setConsumerSearch] = useState("");
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [selectedConsumer, setSelectedConsumer] = useState<Consumer | null>(
    null,
  );
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [planRows, locationRows] = await Promise.all([
        apiRequest<Plan[]>("/memberships"),
        apiRequest<Page<Location>>("/locations?page=1&limit=100"),
      ]);
      const packageEntries = await Promise.all(
        planRows.map(
          async (plan) =>
            [
              plan.id,
              await apiRequest<PackageOption[]>(
                `/memberships/${plan.id}/packages`,
              ),
            ] as const,
        ),
      );
      setPlans(planRows);
      setPackages(Object.fromEntries(packageEntries));
      setDurations(
        [
          ...new Set(
            locationRows.data.flatMap((location) => location.durations),
          ),
        ].sort((a, b) => a - b),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load memberships",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (assignmentSearch.trim()) query.set("search", assignmentSearch.trim());
      const queryString = query.toString();
      const rows = await apiRequest<Assignment[]>(
        `/memberships/assignments${queryString ? `?${queryString}` : ""}`,
      );
      setAssignments(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load assignments",
      );
    }
  }, [assignmentSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (!assignOpen) return;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams();
      if (consumerSearch.trim()) query.set("search", consumerSearch.trim());
      const queryString = query.toString();
      void apiRequest<Consumer[]>(
        `/memberships/consumers${queryString ? `?${queryString}` : ""}`,
      )
        .then(setConsumers)
        .catch((err: unknown) =>
          setError(
            err instanceof Error ? err.message : "Could not search consumers",
          ),
        );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [assignOpen, consumerSearch]);

  const assignablePackages = packages[selectedPlanId] ?? [];
  const selectedPackage = assignablePackages.find(
    (option) => option.id === selectedPackageId && option.isActive,
  );
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const nearExpiryCount = assignments.filter(
    (item) => item.status === "ACTIVE" && item.daysLeft <= 5,
  ).length;

  const packageOptions = useMemo(
    () =>
      assignablePackages.filter(
        (option) => option.isActive && (!selectedPlan || selectedPlan.isActive),
      ),
    [assignablePackages, selectedPlan],
  );

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest("/memberships", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          validityDays: 30,
        }),
      });
      await load();
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      setNotice(
        "Membership created. Add one or more booking packages to make it assignable.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create membership",
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(plan: Plan) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/memberships/${plan.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: plan.name,
          description: plan.description ?? "",
        }),
      });
      setNotice(`${plan.name} details saved.`);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update membership",
      );
    } finally {
      setBusy(false);
    }
  }

  async function togglePlan(plan: Plan) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/memberships/${plan.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !plan.isActive }),
      });
      await load();
      setNotice(
        `${plan.name} is now ${plan.isActive ? "inactive" : "active"}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not change membership status",
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePackage(event: FormEvent, planId: string) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      validityDays: Number(packageDraft.validityDays),
      bookingDurationMinutes: Number(packageDraft.bookingDurationMinutes),
      includedBookings: Number(packageDraft.includedBookings),
      pricePerBooking: Number(packageDraft.pricePerBooking),
    };
    try {
      await apiRequest(
        editingPackageId
          ? `/memberships/packages/${editingPackageId}`
          : `/memberships/${planId}/packages`,
        {
          method: editingPackageId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setPackageFormPlanId(null);
      setEditingPackageId(null);
      setPackageDraft(emptyPackage);
      setNotice(
        editingPackageId
          ? "Package option updated."
          : "Package option created.",
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingPackageId
            ? "Could not update package option"
            : "Could not create package option",
      );
    } finally {
      setBusy(false);
    }
  }

  async function togglePackage(option: PackageOption) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/memberships/packages/${option.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !option.isActive }),
      });
      await load();
      setNotice(
        `Package option ${option.isActive ? "deactivated" : "activated"}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update package option",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deletePackage(option: PackageOption) {
    if ((option.assignmentCount ?? 0) > 0) return;
    if (
      !window.confirm(
        "Delete this unused package option? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/memberships/packages/${option.id}`, {
        method: "DELETE",
      });
      await load();
      setNotice("Package option deleted.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete package option",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assignPackage(event: FormEvent) {
    event.preventDefault();
    if (!selectedConsumer || !selectedPlanId || !selectedPackageId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/memberships/${selectedPlanId}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          userId: selectedConsumer.id,
          packageId: selectedPackageId,
        }),
      });
      setNotice(
        `Package assigned to ${selectedConsumer.name}. They need to confirm the demo payment before booking.`,
      );
      setAssignOpen(false);
      setSelectedConsumer(null);
      setSelectedPackageId("");
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign package");
    } finally {
      setBusy(false);
    }
  }

  if (user?.club?.pricingModel !== "MEMBERSHIP_BASED")
    return (
      <div className="space-y-4">
        <PageTitle
          title="Memberships"
          description="Membership packages are available for membership-based clubs."
        />
        <Notice>
          This club uses shift-based pricing. Membership packages are not
          enabled for its current pricing model.
        </Notice>
      </div>
    );

  return (
    <div className="space-y-5">
      <PageTitle
        title="Memberships"
        description="Create booking packages, assign them to registered consumers, and track expiry and included bookings."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh memberships"
              onClick={() => {
                void load();
                void loadAssignments();
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button onClick={() => setCreateOpen((open) => !open)}>
              <Plus className="size-4" /> Create membership
            </Button>
          </div>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      {createOpen && (
        <PageCard>
          <h3 className="mb-4 text-sm font-semibold">New membership</h3>
          <form
            onSubmit={(event) => void createPlan(event)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Membership name">
              <input
                required
                maxLength={100}
                className={inputClass}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Premium"
              />
            </Field>
            <div className="flex items-end text-xs text-muted-foreground">
              Set actual validity, booking duration, quota, and rate in each
              package option.
            </div>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea
                  maxLength={1000}
                  className={textAreaClass}
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                {busy ? "Saving…" : "Create membership"}
              </Button>
            </div>
          </form>
        </PageCard>
      )}

      {loading ? (
        <Busy label="Loading memberships and packages…" />
      ) : plans.length === 0 ? (
        <Empty>
          Create a membership first, then add package options for its validity,
          booking length, quota, and rate.
        </Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => (
            <PageCard key={plan.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                    <BadgeCheck className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{plan.name}</h3>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {(packages[plan.id] ?? []).length} package option(s)
                    </p>
                  </div>
                </div>
                <Button
                  variant={plan.isActive ? "outline" : "secondary"}
                  size="sm"
                  disabled={busy}
                  onClick={() => void togglePlan(plan)}
                >
                  {plan.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={plan.name}
                    onChange={(event) =>
                      setPlans((rows) =>
                        rows.map((row) =>
                          row.id === plan.id
                            ? { ...row, name: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Description">
                  <input
                    className={inputClass}
                    value={plan.description ?? ""}
                    onChange={(event) =>
                      setPlans((rows) =>
                        rows.map((row) =>
                          row.id === plan.id
                            ? { ...row, description: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void savePlan(plan)}
                >
                  Save details
                </Button>
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold">Booking packages</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!plan.isActive || durations.length === 0}
                    onClick={() => {
                      setEditingPackageId(null);
                      setPackageDraft({
                        ...emptyPackage,
                        bookingDurationMinutes: String(durations[0] ?? 30),
                      });
                      setPackageFormPlanId(
                        packageFormPlanId === plan.id ? null : plan.id,
                      );
                    }}
                  >
                    <Plus className="mr-1 size-3.5" /> Add option
                  </Button>
                </div>
                {(packages[plan.id] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No packages yet. Add a package to make this membership
                    assignable.
                  </p>
                ) : (
                  (packages[plan.id] ?? []).map((option) => {
                    const assignmentCount = option.assignmentCount ?? 0;
                    return (
                      <div
                        key={option.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">
                            {option.validityDays} days ·{" "}
                            {option.bookingDurationMinutes} min ·{" "}
                            {option.includedBookings} bookings
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {money(option.pricePerBooking)} per booking · package
                            fee{" "}
                            <strong className="text-foreground">
                              {money(option.packageFee)}
                            </strong>
                            {assignmentCount > 0 && (
                              <span>
                                {" "}· Assigned {assignmentCount} time
                                {assignmentCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || assignmentCount > 0}
                            title={
                              assignmentCount > 0
                                ? "Assigned package terms are locked to preserve member history."
                                : "Edit package option"
                            }
                            onClick={() => {
                              setPackageDraft({
                                validityDays: String(option.validityDays),
                                bookingDurationMinutes: String(
                                  option.bookingDurationMinutes,
                                ),
                                includedBookings: String(
                                  option.includedBookings,
                                ),
                                pricePerBooking: String(
                                  option.pricePerBooking,
                                ),
                              });
                              setEditingPackageId(option.id);
                              setPackageFormPlanId(plan.id);
                            }}
                          >
                            <Pencil className="mr-1 size-3.5" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={option.isActive ? "outline" : "secondary"}
                            disabled={busy}
                            onClick={() => void togglePackage(option)}
                          >
                            {option.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy || assignmentCount > 0}
                            title={
                              assignmentCount > 0
                                ? "Assigned packages cannot be deleted; deactivate instead."
                                : "Delete unused package option"
                            }
                            onClick={() => void deletePackage(option)}
                          >
                            <Trash2 className="mr-1 size-3.5" /> Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {packageFormPlanId === plan.id && (
                <form
                  onSubmit={(event) => void savePackage(event, plan.id)}
                  className="grid gap-3 rounded-xl border border-primary/20 bg-muted/20 p-4 sm:grid-cols-2"
                >
                  <Field label="Validity (days)">
                    <input
                      required
                      type="number"
                      min={1}
                      max={3650}
                      className={inputClass}
                      value={packageDraft.validityDays}
                      onChange={(event) =>
                        setPackageDraft((draft) => ({
                          ...draft,
                          validityDays: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Booking duration">
                    <select
                      required
                      className={selectClass}
                      value={packageDraft.bookingDurationMinutes}
                      onChange={(event) =>
                        setPackageDraft((draft) => ({
                          ...draft,
                          bookingDurationMinutes: event.target.value,
                        }))
                      }
                    >
                      {durations.map((duration) => (
                        <option key={duration} value={duration}>
                          {duration} minutes
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Included bookings">
                    <input
                      required
                      type="number"
                      min={1}
                      max={10000}
                      className={inputClass}
                      value={packageDraft.includedBookings}
                      onChange={(event) =>
                        setPackageDraft((draft) => ({
                          ...draft,
                          includedBookings: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Rate per booking ($)">
                    <input
                      required
                      type="number"
                      min={0}
                      max={10000000}
                      step="0.01"
                      className={inputClass}
                      value={packageDraft.pricePerBooking}
                      onChange={(event) =>
                        setPackageDraft((draft) => ({
                          ...draft,
                          pricePerBooking: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-xs sm:col-span-2">
                    <span className="text-muted-foreground">
                      Calculated package fee
                    </span>
                    <strong>
                      {money(
                        Number(packageDraft.pricePerBooking || 0) *
                          Number(packageDraft.includedBookings || 0),
                      )}
                    </strong>
                  </div>
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPackageFormPlanId(null);
                        setEditingPackageId(null);
                        setPackageDraft(emptyPackage);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button disabled={busy || !durations.length}>
                      {busy
                        ? "Saving…"
                        : editingPackageId
                          ? "Save package"
                          : "Create package"}
                    </Button>
                  </div>
                </form>
              )}
            </PageCard>
          ))}
        </div>
      )}

      <PageCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4" /> Consumer assignments
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Search accounts already registered in this club context. Consumers
              register themselves; this screen does not create accounts.
            </p>
          </div>
          <Button
            disabled={
              !plans.some(
                (plan) =>
                  plan.isActive &&
                  (packages[plan.id] ?? []).some((option) => option.isActive),
              )
            }
            onClick={() => {
              setAssignOpen((open) => !open);
              setError("");
            }}
          >
            {assignOpen ? "Close assignment" : "Assign package"}
          </Button>
        </div>
        {nearExpiryCount > 0 && (
          <Notice>
            <Clock3 className="mr-1 inline size-3.5" /> {nearExpiryCount}{" "}
            member(s) have 5 or fewer days left. They appear first in the
            assignment list.
          </Notice>
        )}
        {assignOpen && (
          <form
            onSubmit={(event) => void assignPackage(event)}
            className="space-y-4 rounded-xl border border-border bg-muted/20 p-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Find a registered consumer">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className={`${inputClass} pl-9`}
                    value={consumerSearch}
                    onChange={(event) => {
                      setConsumerSearch(event.target.value);
                      setSelectedConsumer(null);
                    }}
                    placeholder="Name or email"
                  />
                </div>
              </Field>
              <Field label="Membership">
                <select
                  required
                  className={selectClass}
                  value={selectedPlanId}
                  onChange={(event) => {
                    setSelectedPlanId(event.target.value);
                    setSelectedPackageId("");
                  }}
                >
                  <option value="">Choose membership</option>
                  {plans
                    .filter((plan) => plan.isActive)
                    .map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Package option">
                <select
                  required
                  className={selectClass}
                  value={selectedPackageId}
                  onChange={(event) => setSelectedPackageId(event.target.value)}
                  disabled={!packageOptions.length}
                >
                  <option value="">Choose validity, duration, and quota</option>
                  {packageOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.validityDays} days ·{" "}
                      {option.bookingDurationMinutes} min ·{" "}
                      {option.includedBookings} bookings ·{" "}
                      {money(option.packageFee)}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedPackage && (
                <div className="flex items-end text-xs text-muted-foreground">
                  The new package has a fresh quota of{" "}
                  {selectedPackage.includedBookings} bookings. It does not carry
                  over unused credits.
                </div>
              )}
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
              {consumers.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  No matching club consumers. They must register using this
                  club’s slug first.
                </p>
              ) : (
                consumers.map((consumer) => (
                  <button
                    key={consumer.id}
                    type="button"
                    onClick={() => setSelectedConsumer(consumer)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs ${selectedConsumer?.id === consumer.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  >
                    <span className="font-medium">{consumer.name}</span>
                    <span className="text-muted-foreground">
                      {consumer.email}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {selectedConsumer
                  ? `Selected: ${selectedConsumer.name}`
                  : "Select a consumer to continue."}{" "}
                {selectedPackage
                  ? `· ${money(selectedPackage.packageFee)} package fee`
                  : ""}
              </p>
              <Button
                disabled={
                  busy ||
                  !selectedConsumer ||
                  !selectedPlanId ||
                  !selectedPackageId
                }
              >
                {busy ? "Assigning…" : "Assign package"}
              </Button>
            </div>
          </form>
        )}
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={assignmentSearch}
            onChange={(event) => setAssignmentSearch(event.target.value)}
            placeholder="Filter assignments by consumer name or email"
          />
          <Button variant="outline" onClick={() => void loadAssignments()}>
            Search
          </Button>
        </div>
        {assignments.length === 0 ? (
          <Empty>No membership assignments match this search.</Empty>
        ) : (
          <div className="space-y-2">
            {assignments.map((item) => {
              const nearExpiry = item.status === "ACTIVE" && item.daysLeft <= 5;
              return (
                <article
                  key={item.id}
                  className={`rounded-xl border p-4 ${nearExpiry ? "border-amber-300 bg-amber-50/60" : "border-border bg-background"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-semibold">
                          {item.consumer?.name ?? "Consumer"}
                        </h4>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                          {item.status.replace(/_/g, " ")}
                        </span>
                        {nearExpiry && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                            Renewal due · {item.daysLeft} day(s)
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.consumer?.email ?? ""} ·{" "}
                        {item.membership?.name ?? "Membership"} ·{" "}
                        {item.package
                          ? `${item.package.validityDays} days / ${item.package.bookingDurationMinutes} min`
                          : "Package unavailable"}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold">
                        {item.bookingsRemaining ?? "—"} credit(s) left
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {item.bookingsUsed ?? 0} used · expires{" "}
                        {dateLabel(item.expiresAt)}
                      </p>
                    </div>
                  </div>
                  {item.status === "PENDING_PAYMENT" && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                      Awaiting consumer demo checkout. No payment has been
                      collected; booking access is locked until checkout is
                      confirmed.
                    </p>
                  )}
                  {item.payment?.status === "SIMULATED_PAID" && (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Demo receipt recorded{" "}
                      {item.payment.paidAt
                        ? dateLabel(item.payment.paidAt)
                        : ""}{" "}
                      · {money(item.payment.amount)}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </PageCard>
    </div>
  );
}
