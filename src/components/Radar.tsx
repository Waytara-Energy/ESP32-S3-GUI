import type { Blip } from "@/lib/radar";
import { pointOf } from "@/lib/radar";
import type { RememberedUnit } from "@/lib/units-store";

/**
 * The radar: rings, a sweeping beam and the units heard, each a button at a steady angle, nearer the middle the stronger its signal. A unit pops
 * in when it is first heard. The page also lists the same units as plain buttons under the radar, for a keyboard or a screen reader.
 */
export function Radar({ blips, remembered, busyId, onPick }: { blips: Blip[]; remembered: RememberedUnit[]; busyId: string | null; onPick: (b: Blip) => void }) {
  return (
    <div className="radar" role="group" aria-label="Units in range">
      <div className="radar-rings" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="radar-beam" aria-hidden />
      <div className="radar-you" aria-hidden />
      {blips.map((b) => {
        const p = pointOf(b, 100);
        const mine = remembered.find((r) => r.name === b.name);
        return (
          <button
            key={b.id}
            className={`blip${busyId === b.id ? " busy" : ""}${b.device ? "" : " new"}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onClick={() => onPick(b)}
            disabled={busyId !== null}
            aria-label={`${mine?.label ?? b.name}${mine?.site ? `, ${mine.site}` : ""}${b.device ? "" : ", new to this browser"}`}
          >
            <span className="dot">{busyId === b.id ? <span className="spin" aria-hidden /> : <BlipIcon />}</span>
            <span className="tag">
              <strong>{mine?.label ?? b.name}</strong>
              <small>{mine?.site ?? (b.device ? b.name : "New unit")}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BlipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
    </svg>
  );
}
