import { useEffect, useRef, useState } from "react";
import type { LogLine } from "@/ble/unit-link";
import { useApp } from "@/state";
import { Notice, PageHead } from "@/ui";

const KEEP = 600;

/** The unit's own log as it happens (service level). The newest 600 lines are kept; nothing is stored anywhere. */
export function Logs() {
  const { unit } = useApp();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (!unit) return;
    const { link } = unit;
    let live = true;
    link.onLog = (got) => {
      if (pausedRef.current) return;
      setLines((cur) => {
        const seen = new Set(cur.slice(-80).map((l) => l.n));
        const next = [...cur, ...got.filter((l) => !seen.has(l.n))];
        return next.length > KEEP ? next.slice(next.length - KEEP) : next;
      });
    };
    link.logs(true).catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Could not start the log."));
    return () => {
      live = false;
      link.onLog = null;
      void link.logs(false).catch(() => undefined);
    };
  }, [unit]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function download() {
    const blob = new Blob([lines.map((l) => l.text).join("\n") + "\n"], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `waytara-unit-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!unit) return null;
  return (
    <>
      <PageHead title="Live logs" sub="What the unit is doing right now, line by line. The times are the unit's own (milliseconds since it started)." />
      <div className="toolbar">
        <button className="btn small" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? "Resume" : "Pause"}
        </button>
        <button className="btn small" onClick={() => setLines([])}>
          Clear
        </button>
        <button className="btn small" onClick={download} disabled={lines.length === 0}>
          Download
        </button>
        <span className="sub">{lines.length} lines</span>
      </div>
      {error ? <Notice kind="bad">{error}</Notice> : null}
      <div
        className="terminal"
        ref={box}
        role="log"
        aria-live="off"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {lines.length === 0 ? <span className="ln">Waiting for the unit…</span> : lines.map((l) => <span key={l.n} className="ln">{l.text}</span>)}
      </div>
    </>
  );
}
