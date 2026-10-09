import type { ReactNode } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";

export function PageCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && (
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/65 focus:border-ring focus:ring-2 focus:ring-ring/20";
export const selectClass = inputClass;
export const textAreaClass =
  "min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";

export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : undefined}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5 ${error ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-muted-foreground"}`}
    >
      {error && <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      {children}
    </div>
  );
}

export function Busy({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
