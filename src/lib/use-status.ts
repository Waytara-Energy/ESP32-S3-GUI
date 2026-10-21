import { useEffect, useRef, useState } from "react";
import type { UnitLink, UnitStatus } from "@/ble/unit-link";

/** The unit's own account of itself, asked again every few seconds while the page that shows it is open. */
export function useUnitStatus(link: UnitLink | undefined, everyMs = 5000): { status: UnitStatus | null; error: string | null; at: number | null; refresh: () => void } {
  const [status, setStatus] = useState<UnitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const kick = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!link) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (timer) clearTimeout(timer);
      try {
        const v = await link.status();
        if (live) {
          setStatus(v);
          setAt(Date.now());
          setError(null);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not read the status.");
      }
      if (live) timer = setTimeout(() => void tick(), everyMs);
    };
    kick.current = () => void tick();
    void tick();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [link, everyMs]);

  return { status, error, at, refresh: () => kick.current() };
}

/** "3 s ago", "2 min ago". */
export function agoText(t: number | null, now = Date.now()): string {
  if (t === null) return "–";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 90) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
}

export function uptimeText(s: number): string {
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172_800) return `${(s / 3600).toFixed(1)} h`;
  return `${Math.round(s / 86_400)} days`;
}

export const kb = (bytes: number): string => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
