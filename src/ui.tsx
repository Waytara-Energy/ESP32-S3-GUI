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

export const STAGES = [
  { id: "pick", name: "Device" },
  { id: "connect", name: "Unit" },
  { id: "wifi", name: "Wi-Fi" },
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

export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M18 4 8 18h7l-1 10 10-14h-7z" fill="var(--accent-fg)" />
    </svg>
  );
}
