import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Coins, Plus, RefreshCw, Trash2 } from "lucide-react";
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
} from "@/components/admin-ui";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";

type Location = { id: string; name: string; durations: number[] };
type Court = {
  id: string;
  name: string;
  durations: number[];
  isActive: boolean;
};
type Shift = {
  id: string;
  locationId: string;
  name: string;
  startTime: string;
  endTime: string;
};
type Price = {
  durationMinutes: number;
  shiftId: string | null;
  shiftName: string;
  price: number;
};
type PriceResponse = {
  courtId: string;
  courtName: string;
  durations: number[];
  shifts: Shift[];
  prices: Price[];
  missing: Array<{
    durationMinutes: number;
    shiftId: string | null;
    shiftName: string;
  }>;
};
type Page<T> = { data: T[] };

export function PricingPage() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState("");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [priceData, setPriceData] = useState<PriceResponse | null>(null);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("08:00");
  const [newEnd, setNewEnd] = useState("12:00");
  const location =
    locations.find((item) => item.id === locationId) ?? locations[0];
  const court = courts.find((item) => item.id === courtId) ?? courts[0];
  const priceKey = (duration: number, shift: string | null) =>
    `${duration}:${shift ?? "normal"}`;
  const slots = useMemo(
    () => [
      { id: null as string | null, name: "Normal price" },
      ...shifts.map((shift) => ({ id: shift.id, name: shift.name })),
    ],
    [shifts],
  );

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<Page<Location>>(
        "/locations?page=1&limit=100",
      );
      setLocations(result.data);
      setLocationId((previous) =>
        result.data.some((item) => item.id === previous)
          ? previous
          : (result.data[0]?.id ?? ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLocationData = useCallback(async (id: string) => {
    if (!id) {
      setCourts([]);
      setShifts([]);
      setPriceData(null);
      return;
    }
    setError("");
    try {
      const [courtRows, shiftRows] = await Promise.all([
        apiRequest<Court[]>(`/locations/${id}/courts`),
        apiRequest<Shift[]>(`/pricing/locations/${id}/shifts`),
      ]);
      setCourts(courtRows);
      setShifts(shiftRows);
      setCourtId((previous) =>
        courtRows.some((item) => item.id === previous)
          ? previous
          : (courtRows[0]?.id ?? ""),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load pricing data",
      );
    }
  }, []);

  const loadPrices = useCallback(async (id: string) => {
    if (!id) {
      setPriceData(null);
      return;
    }
    try {
      const result = await apiRequest<PriceResponse>(`/pricing/courts/${id}`);
      setPriceData(result);
      setDraftPrices(
        Object.fromEntries(
          result.prices.map((item) => [
            priceKey(item.durationMinutes, item.shiftId),
            String(item.price),
          ]),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load court prices",
      );
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);
  useEffect(() => {
    void loadLocationData(locationId);
  }, [locationId, loadLocationData]);
  useEffect(() => {
    void loadPrices(courtId);
  }, [courtId, loadPrices]);

  async function createShift(event: FormEvent) {
    event.preventDefault();
    if (!location) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<Shift>("/pricing/shifts", {
        method: "POST",
        body: JSON.stringify({
          locationId: location.id,
          name: newName,
          startTime: newStart,
          endTime: newEnd,
        }),
      });
      await loadLocationData(location.id);
      setCreateOpen(false);
      setNewName("");
      setNotice("Pricing shift created.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create pricing shift",
      );
    } finally {
      setBusy(false);
    }
  }

  async function editShift(shift: Shift, changes: Partial<Shift>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<Shift>(`/pricing/shifts/${shift.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: changes.name ?? shift.name,
          startTime: changes.startTime ?? shift.startTime,
          endTime: changes.endTime ?? shift.endTime,
        }),
      });
      setShifts((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice("Shift updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update shift");
    } finally {
      setBusy(false);
    }
  }

  async function removeShift(shift: Shift) {
    if (
      !window.confirm(
        `Delete “${shift.name}”? Its prices for this shift will also be removed.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/pricing/shifts/${shift.id}`, { method: "DELETE" });
      if (location) await loadLocationData(location.id);
      if (court) await loadPrices(court.id);
      setNotice("Shift and its prices removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove shift");
    } finally {
      setBusy(false);
    }
  }

  async function savePrices() {
    if (!court || !priceData) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const prices = priceData.durations.flatMap((durationMinutes) =>
        slots.flatMap((slot) => {
          const value = draftPrices[priceKey(durationMinutes, slot.id)]?.trim();
          return value === undefined || value === ""
            ? []
            : [{ durationMinutes, shiftId: slot.id, price: Number(value) }];
        }),
      );
      const updated = await apiRequest<PriceResponse>(
        `/pricing/courts/${court.id}`,
        { method: "PUT", body: JSON.stringify({ prices }) },
      );
      setPriceData(updated);
      setDraftPrices(
        Object.fromEntries(
          updated.prices.map((item) => [
            priceKey(item.durationMinutes, item.shiftId),
            String(item.price),
          ]),
        ),
      );
      setNotice(`Prices saved for ${court.name}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save court prices",
      );
    } finally {
      setBusy(false);
    }
  }

  if (user?.club?.pricingModel !== "SHIFT_BASED")
    return (
      <div className="space-y-4">
        <PageTitle
          title="Pricing"
          description="Shift and court price management is for shift-based clubs."
        />
        <Notice>
          This club uses membership-based pricing. Manage duration prices on the
          Membership plans page.
        </Notice>
      </div>
    );

  return (
    <div className="space-y-5">
      <PageTitle
        title="Pricing"
        description="Set time-based shifts and prices for each court and booking duration."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh pricing"
              onClick={() => void loadLocationData(locationId)}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              onClick={() => setCreateOpen((value) => !value)}
              disabled={!location}
            >
              <Plus className="size-4" />
              Add shift
            </Button>
          </div>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <PageCard className="grid gap-4 sm:grid-cols-2">
        <Field label="Location">
          <select
            className={selectClass}
            value={location?.id ?? ""}
            onChange={(event) => setLocationId(event.target.value)}
          >
            {locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Court">
          <select
            className={selectClass}
            value={court?.id ?? ""}
            onChange={(event) => setCourtId(event.target.value)}
          >
            {courts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      </PageCard>
      {createOpen && location && (
        <PageCard>
          <h3 className="mb-4 text-sm font-semibold">New pricing shift</h3>
          <form
            onSubmit={(event) => void createShift(event)}
            className="grid gap-4 sm:grid-cols-4"
          >
            <Field label="Shift name">
              <input
                required
                className={inputClass}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Morning peak"
              />
            </Field>
            <Field label="Starts">
              <input
                required
                type="time"
                className={inputClass}
                value={newStart}
                onChange={(event) => setNewStart(event.target.value)}
              />
            </Field>
            <Field label="Ends">
              <input
                required
                type="time"
                className={inputClass}
                value={newEnd}
                onChange={(event) => setNewEnd(event.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button className="w-full" disabled={busy}>
                {busy ? "Saving…" : "Create shift"}
              </Button>
            </div>
          </form>
        </PageCard>
      )}
      <PageCard>
        <PageTitle
          title="Pricing shifts"
          description="Shifts cannot overlap. Deleting one also removes prices assigned to it."
        />
        <div className="space-y-2">
          {loading ? (
            <Busy />
          ) : !location ? (
            <Empty>Create a location to define pricing shifts.</Empty>
          ) : shifts.length === 0 ? (
            <Empty>
              No shifts yet. Normal prices can be configured below; add shifts
              for different time bands.
            </Empty>
          ) : (
            shifts.map((shift) => (
              <div
                key={shift.id}
                className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(120px,1fr)_140px_140px_auto_auto] sm:items-end"
              >
                <Field label="Shift">
                  <input
                    className={inputClass}
                    value={shift.name}
                    onChange={(event) =>
                      setShifts((items) =>
                        items.map((item) =>
                          item.id === shift.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Start">
                  <input
                    type="time"
                    className={inputClass}
                    value={shift.startTime}
                    onChange={(event) =>
                      setShifts((items) =>
                        items.map((item) =>
                          item.id === shift.id
                            ? { ...item, startTime: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="End">
                  <input
                    type="time"
                    className={inputClass}
                    value={shift.endTime}
                    onChange={(event) =>
                      setShifts((items) =>
                        items.map((item) =>
                          item.id === shift.id
                            ? { ...item, endTime: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void editShift(shift, {})}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${shift.name}`}
                  disabled={busy}
                  onClick={() => void removeShift(shift)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </PageCard>
      {loading ? (
        <Busy label="Loading court prices…" />
      ) : !court ? (
        <Empty>Add a court at this location to configure prices.</Empty>
      ) : (
        priceData && (
          <PageCard>
            <PageTitle
              title={`Prices · ${court.name}`}
              description="Enter a price for each duration and time band. Blank combinations remain unpriced."
              action={<Coins className="size-5 text-primary" />}
            />
            {priceData.durations.length === 0 ? (
              <Notice>
                No booking durations are configured for this court.
              </Notice>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-130 text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3">Duration</th>
                      {slots.map((slot) => (
                        <th key={slot.id ?? "normal"} className="px-3 py-3">
                          {slot.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {priceData.durations.map((duration) => (
                      <tr
                        key={duration}
                        className="border-b border-border last:border-0"
                      >
                        <th className="px-3 py-3 font-medium">
                          {duration} min
                        </th>
                        {slots.map((slot) => (
                          <td key={slot.id ?? "normal"} className="px-3 py-2">
                            <input
                              aria-label={`${duration} minutes ${slot.name} price`}
                              type="number"
                              min={0}
                              max={1000000}
                              step="0.01"
                              className={`${inputClass} min-w-28`}
                              value={
                                draftPrices[priceKey(duration, slot.id)] ?? ""
                              }
                              onChange={(event) =>
                                setDraftPrices((all) => ({
                                  ...all,
                                  [priceKey(duration, slot.id)]:
                                    event.target.value,
                                }))
                              }
                              placeholder="Not set"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground">
                Saving replaces this court’s full price list.
              </p>
              <Button
                disabled={busy || !priceData.durations.length}
                onClick={() => void savePrices()}
              >
                {busy ? "Saving…" : "Save all prices"}
              </Button>
            </div>
          </PageCard>
        )
      )}
    </div>
  );
}
