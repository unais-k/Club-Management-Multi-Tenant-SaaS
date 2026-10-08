import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Clock3, Grid2X2, Plus, RefreshCw } from "lucide-react";
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

type Hours = { dayOfWeek: number; openTime: string; closeTime: string };
type Location = { id: string; name: string; durations: number[] };
type Court = {
  id: string;
  locationId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  durations: number[];
  usesLocationHours: boolean;
  openingHours: Hours[];
};
type Page<T> = { data: T[]; meta: { total: number } };
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const durationList = (value: string) =>
  [
    ...new Set(
      value
        .split(",")
        .map(Number)
        .filter((item) => Number.isInteger(item) && item >= 5 && item <= 480),
    ),
  ].sort((a, b) => a - b);
type HoursDraft = Hours & { enabled: boolean };
const hoursForCourt = (court: Court): HoursDraft[] =>
  Array.from({ length: 7 }, (_, dayOfWeek) => {
    const existing = court.openingHours.find(
      (period) => period.dayOfWeek === dayOfWeek,
    );
    return existing
      ? { ...existing, enabled: true }
      : { dayOfWeek, openTime: "08:00", closeTime: "22:00", enabled: false };
  });

export function CourtsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMode, setDurationMode] = useState("all");
  const [durations, setDurations] = useState("");
  const [hoursDrafts, setHoursDrafts] = useState<Record<string, HoursDraft[]>>(
    {},
  );
  const location =
    locations.find((item) => item.id === locationId) ?? locations[0];
  const selectedDurations = useMemo(() => durationList(durations), [durations]);

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

  const loadCourts = useCallback(async (id: string) => {
    if (!id) {
      setCourts([]);
      return;
    }
    try {
      setCourts(await apiRequest<Court[]>(`/locations/${id}/courts`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load courts");
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);
  useEffect(() => {
    void loadCourts(locationId);
  }, [locationId, loadCourts]);

  async function createCourt(event: FormEvent) {
    event.preventDefault();
    if (!location) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/locations/${location.id}/courts`, {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          durations: durationMode === "all" ? undefined : selectedDurations,
        }),
      });
      await loadCourts(location.id);
      setCreateOpen(false);
      setName("");
      setDescription("");
      setDurations("");
      setDurationMode("all");
      setNotice("Court created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create court");
    } finally {
      setBusy(false);
    }
  }

  async function updateCourt(court: Court, changes: Partial<Court>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<Court>(`/courts/${court.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: changes.name ?? court.name,
          description: changes.description ?? court.description ?? "",
          durations: changes.durations ?? court.durations,
          isActive: changes.isActive ?? court.isActive,
        }),
      });
      setCourts((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice("Court updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update court");
    } finally {
      setBusy(false);
    }
  }

  async function saveHours(court: Court, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const rows = hoursDrafts[court.id] ?? hoursForCourt(court);
      const body = court.usesLocationHours
        ? { useLocationHours: true }
        : {
            useLocationHours: false,
            openingHours: rows
              .filter((row) => row.enabled)
              .map(({ dayOfWeek, openTime, closeTime }) => ({
                dayOfWeek,
                openTime,
                closeTime,
              })),
          };
      const updated = await apiRequest<Court>(
        `/courts/${court.id}/opening-hours`,
        { method: "PUT", body: JSON.stringify(body) },
      );
      setCourts((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice("Court opening hours saved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save court hours",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeCourt(court: Court) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/courts/${court.id}`, { method: "DELETE" });
      await loadCourts(court.locationId);
      setNotice("Court removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove court");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Courts"
        description="Configure courts, offered booking durations, and court-specific opening hours."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh courts"
              onClick={() => void loadCourts(locationId)}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              onClick={() => setCreateOpen((value) => !value)}
              disabled={!location}
            >
              <Plus className="size-4" />
              Add court
            </Button>
          </div>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <PageCard className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-60 flex-1">
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
        </div>
        <p className="text-xs text-muted-foreground">
          {location
            ? `${location.durations.join(" · ")} minute durations available`
            : "Create a location first"}
        </p>
      </PageCard>
      {createOpen && location && (
        <PageCard>
          <h3 className="mb-4 text-sm font-semibold">
            New court · {location.name}
          </h3>
          <form
            onSubmit={(event) => void createCourt(event)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Court name">
              <input
                required
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Court 1"
              />
            </Field>
            <Field label="Description">
              <input
                className={inputClass}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional details"
              />
            </Field>
            <Field label="Booking durations">
              <select
                className={selectClass}
                value={durationMode}
                onChange={(event) => setDurationMode(event.target.value)}
              >
                <option value="all">Use all location durations</option>
                <option value="custom">Choose a subset</option>
              </select>
            </Field>
            {durationMode === "custom" && (
              <Field
                label="Selected durations (minutes)"
                hint={`Location offers ${location.durations.join(", ")} minutes`}
              >
                <input
                  required
                  className={inputClass}
                  value={durations}
                  onChange={(event) => setDurations(event.target.value)}
                />
              </Field>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  busy ||
                  (durationMode === "custom" && !selectedDurations.length)
                }
              >
                {busy ? "Saving…" : "Create court"}
              </Button>
            </div>
          </form>
        </PageCard>
      )}
      {loading ? (
        <Busy label="Loading courts…" />
      ) : !locations.length ? (
        <Empty>Add a location before creating courts.</Empty>
      ) : courts.length === 0 ? (
        <Empty>No courts at this location yet.</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {courts.map((court) => (
            <PageCard key={court.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                    <Grid2X2 className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{court.name}</h3>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {court.durations.join(" · ")} min ·{" "}
                      {court.usesLocationHours
                        ? "Follows location hours"
                        : "Custom hours"}
                    </p>
                  </div>
                </div>
                <select
                  aria-label={`Set ${court.name} status`}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                  value={String(court.isActive)}
                  disabled={busy}
                  onChange={(event) =>
                    void updateCourt(court, {
                      isActive: event.target.value === "true",
                    })
                  }
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Court name">
                  <input
                    className={inputClass}
                    value={court.name}
                    onChange={(event) =>
                      setCourts((items) =>
                        items.map((item) =>
                          item.id === court.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Durations">
                  <input
                    className={inputClass}
                    value={court.durations.join(", ")}
                    onChange={(event) => {
                      const values = durationList(event.target.value);
                      setCourts((items) =>
                        items.map((item) =>
                          item.id === court.id
                            ? { ...item, durations: values }
                            : item,
                        ),
                      );
                    }}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Description">
                    <textarea
                      className={textAreaClass}
                      value={court.description ?? ""}
                      onChange={(event) =>
                        setCourts((items) =>
                          items.map((item) =>
                            item.id === court.id
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
              </div>
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => void removeCourt(court)}
                >
                  Remove court
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void updateCourt(court, {})}
                >
                  Save court
                </Button>
              </div>
              <details className="rounded-xl border border-border">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold">
                  <Clock3 className="size-4 text-primary" />
                  Opening hours{" "}
                  <span className="ml-auto text-muted-foreground">
                    {court.usesLocationHours
                      ? "Use location schedule"
                      : "Custom schedule"}{" "}
                    ⌄
                  </span>
                </summary>
                <div className="border-t border-border p-4">
                  <form
                    onSubmit={(event) => void saveHours(court, event)}
                    className="space-y-3"
                  >
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={court.usesLocationHours}
                        onChange={(event) =>
                          setCourts((items) =>
                            items.map((item) =>
                              item.id === court.id
                                ? {
                                    ...item,
                                    usesLocationHours: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      Follow location opening hours
                    </label>
                    {!court.usesLocationHours && (
                      <div className="space-y-2">
                        {(hoursDrafts[court.id] ?? hoursForCourt(court)).map(
                          (row, index) => (
                            <div
                              key={row.dayOfWeek}
                              className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2"
                            >
                              <label className="flex items-center gap-2 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={row.enabled}
                                  onChange={(event) =>
                                    setHoursDrafts((all) => ({
                                      ...all,
                                      [court.id]: (
                                        all[court.id] ?? hoursForCourt(court)
                                      ).map((item) =>
                                        item.dayOfWeek === row.dayOfWeek
                                          ? {
                                              ...item,
                                              enabled: event.target.checked,
                                            }
                                          : item,
                                      ),
                                    }))
                                  }
                                />
                                {days[index]}
                              </label>
                              <input
                                type="time"
                                aria-label={`${days[index]} opening time`}
                                className={inputClass}
                                value={row.openTime}
                                onChange={(event) =>
                                  setHoursDrafts((all) => ({
                                    ...all,
                                    [court.id]: (
                                      all[court.id] ?? hoursForCourt(court)
                                    ).map((item) =>
                                      item.dayOfWeek === row.dayOfWeek
                                        ? {
                                            ...item,
                                            openTime: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              <input
                                type="time"
                                aria-label={`${days[index]} closing time`}
                                className={inputClass}
                                value={row.closeTime}
                                onChange={(event) =>
                                  setHoursDrafts((all) => ({
                                    ...all,
                                    [court.id]: (
                                      all[court.id] ?? hoursForCourt(court)
                                    ).map((item) =>
                                      item.dayOfWeek === row.dayOfWeek
                                        ? {
                                            ...item,
                                            closeTime: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          ),
                        )}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button size="sm" disabled={busy}>
                        <Clock3 className="size-3.5" />
                        Save schedule
                      </Button>
                    </div>
                  </form>
                </div>
              </details>
            </PageCard>
          ))}
        </div>
      )}
    </div>
  );
}
