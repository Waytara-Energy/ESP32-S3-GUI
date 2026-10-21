import type { ReactNode } from "react";

/**
 * The page kit: one look for every page. A large title with a line under it and actions on the right; grouped lists of label and value rows (like
 * a system settings screen); status pills that always carry a word, never colour alone; stat tiles; and small meters.
 */

export function Page({ title, sub, actions, children }: { title?: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="pg">
      {title || actions ? (
      <header className="pg-head">
        <div className="pg-title">
          <h1>{title}</h1>
          {sub ? <p>{sub}</p> : null}
        </div>
        {actions ? <div className="pg-actions">{actions}</div> : null}
      </header>
      ) : null}
      {children}
    </div>
  );
}

/** A titled group of rows with an optional note under it. */
export function Group({ title, note, aside, children }: { title?: string; note?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="grp">
      {title || aside ? (
        <div className="grp-head">
          {title ? <h2>{title}</h2> : <span />}
          {aside ? <div>{aside}</div> : null}
        </div>
      ) : null}
      <div className="grp-body">{children}</div>
      {note ? <p className="grp-note">{note}</p> : null}
    </section>
  );
}

/** One line of a group: what it is on the left, its value on the right, a smaller explanation under the label when useful. */
export function Row({ label, hint, value, mono = false, children }: { label: ReactNode; hint?: ReactNode; value?: ReactNode; mono?: boolean; children?: ReactNode }) {
  return (
    <div className="row-i">
      <div className="row-l">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className={`row-v${mono ? " mono" : ""}`}>{children ?? value ?? "–"}</div>
    </div>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

/** A small status: a dot and a word. */
export function Pill({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      <i aria-hidden />
      {children}
    </span>
  );
}

export const yesNo = (yes: boolean | undefined, y = "Yes", n = "No", badTone: Tone = "bad"): ReactNode =>
  yes === undefined ? <Pill>Unknown</Pill> : yes ? <Pill tone="ok">{y}</Pill> : <Pill tone={badTone}>{n}</Pill>;

/** A row of big figures. */
export function Tiles({ children }: { children: ReactNode }) {
  return <div className="tiles">{children}</div>;
}

export function Tile({ label, value, unit, sub, tone, meter }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: Tone; meter?: number }) {
  return (
    <div className={`tile${tone ? ` t-${tone}` : ""}`}>
      <span className="tile-l">{label}</span>
      <span className="tile-v">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      {meter !== undefined ? <Meter value={meter} tone={tone} /> : null}
      {sub ? <span className="tile-s">{sub}</span> : null}
    </div>
  );
}

/** A thin bar from 0 to 1. */
export function Meter({ value, tone = "ok" }: { value: number; tone?: Tone }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={`meter m-${tone}`} role="presentation">
      <i style={{ width: `${Math.round(v * 100)}%` }} />
    </span>
  );
}

/** Two or three choices as one control. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}
