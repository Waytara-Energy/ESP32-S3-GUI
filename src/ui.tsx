import type { ReactNode } from "react";
import { signalLabel } from "./lib/messages";

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="spin" aria-hidden />
      {label ? <span>{label}</span> : <span className="visually-hidden">Working</span>}
    </span>
  );
}

export function Notice({ kind, children }: { kind: "bad" | "warn" | "ok" | "info"; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === "bad" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function SignalBars({ rssi }: { rssi: number }) {
  const { label, level } = signalLabel(rssi);
  const lit = level === 0 ? 1 : level + 1;
  return (
    <span className="bars" role="img" aria-label={`Signal: ${label}`} title={`${label} (${rssi} dBm)`}>
      {[4, 7, 10, 14].map((h, i) => (
        <i key={h} className={i < lit ? "on" : ""} style={{ height: h }} />
      ))}
    </span>
  );
}

/** The steps of setting up a new unit (the Setup page). */
export const STAGES = [
  { id: "pick", name: "Device" },
  { id: "checks", name: "Checks" },
  { id: "claim", name: "Finish" },
] as const;
export type Stage = (typeof STAGES)[number]["id"] | "done";

export function Stepper({ stage }: { stage: Stage }) {
  const at = stage === "done" ? STAGES.length : STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="stepper" aria-label="Progress">
      {STAGES.map((s, i) => (
        <li key={s.id} className={i < at ? "done" : i === at ? "current" : ""} aria-current={i === at ? "step" : undefined}>
          <div className="bar" />
          <span className="name">{s.name}</span>
        </li>
      ))}
    </ol>
  );
}

/** The WayTara wordmark (the same logo file as the dashboard). On the dark theme it sits on a light chip so "ENERGY" stays readable. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <img className={`logo wordmark ${className}`} src="/logo.png" alt="WayTara Energy" width={140} height={30} />;
}

/** One small line icon per page, drawn here so the page needs no icon library. */
const PATHS: Record<string, string> = {
  units: "M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01",
  details: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  overview: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  status: "M22 12h-4l-3 9L9 3l-3 9H2",
  network: "M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01",
  live: "M13 2 3 14h9l-1 8 10-12h-9z",
  map: "M3 6h18M3 12h18M3 18h18M7 3v6M12 9v6M17 15v6",
  setup: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  interval: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4",
  logs: "M4 17l6-6-6-6M12 19h8",
  activity: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  menu: "M3 12h18M3 6h18M3 18h18",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.status} />
    </svg>
  );
}

export function PageHead({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {sub ? <p className="sub">{sub}</p> : null}
    </div>
  );
}

/** A yes/no as a small coloured word, never colour alone. */
export function YesNo({ yes, yesText = "Yes", noText = "No", warnIfNo = false }: { yes: boolean; yesText?: string; noText?: string; warnIfNo?: boolean }) {
  return <span className={`badge ${yes ? "ok" : warnIfNo ? "warn" : "bad"}`}>{yes ? yesText : noText}</span>;
}
