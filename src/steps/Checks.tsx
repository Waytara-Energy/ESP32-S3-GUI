import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckReport, SpeedResult } from "@/ble/unit-link";
import type { ConnectedUnit } from "@/lib/connect-flow";
import { checkTitle, checksVerdict, kbit, signalLabel, speedVerdict, stepState } from "@/lib/messages";
import { Notice, Spinner } from "@/ui";

const MARK = { ok: "✓", failed: "✕", skipped: "–" } as const;

export function Checks({ unit, claimed, onNext }: { unit: ConnectedUnit; claimed: boolean; onNext: () => void }) {
  const { link } = unit;
  const [report, setReport] = useState<CheckReport | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<SpeedResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await link.checks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The checks could not run.");
    } finally {
      setRunning(false);
    }
  }, [link]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  async function runSpeed() {
    setTesting(true);
    setError(null);
    try {
      setSpeed(await link.speed());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The speed test failed.");
    } finally {
      setTesting(false);
    }
  }

  const verdict = report ? checksVerdict(report, claimed) : null;
  const sv = speed ? speedVerdict(speed) : null;

  return (
    <section className="card">
      <h2>Check the connection</h2>
      <p className="sub">The unit tests its own way to WayTara: Wi-Fi, name lookup, clock, secure connection and the server. This takes about 20 seconds.</p>

      {running && !report ? <Spinner label="Running the checks" /> : null}
      {report ? (
        <ul className="steps" aria-label="Check results">
          {report.steps.map((s) => {
            const st = stepState(s);
            return (
              <li key={s.name}>
                <span className={`dot ${st}`} aria-hidden>
                  {MARK[st]}
                </span>
                <span>
                  {checkTitle(s.name)} <span className="visually-hidden">{st === "ok" ? "passed" : st === "failed" ? "failed" : "not run"}</span>
                </span>
                <span className="sub">{s.skipped ? "" : `${s.ms} ms`}</span>
                {s.detail ? <span className="detail">{s.detail}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {verdict ? <Notice kind={verdict.pass ? "ok" : "bad"}>{verdict.text}</Notice> : null}

      <div className="actions">
        <button className="btn" onClick={run} disabled={running || testing}>
          {running && report ? <Spinner label="Running" /> : "Run the checks again"}
        </button>
        <button className="btn" onClick={runSpeed} disabled={running || testing}>
          {testing ? <Spinner label="Testing (about 30 s)" /> : "Speed test"}
        </button>
      </div>

      {speed && sv ? (
        <>
          <dl className="kv">
            <dt>Wi-Fi signal</dt>
            <dd>
              {signalLabel(speed.rssi).label} ({speed.rssi} dBm), channel {speed.channel}
            </dd>
            <dt>Delay to server</dt>
            <dd>{speed.rtt_ms} ms</dd>
            <dt>Download</dt>
            <dd>{kbit(speed.down_kbps)}</dd>
            <dt>Upload</dt>
            <dd>{kbit(speed.up_kbps)}</dd>
          </dl>
          <Notice kind={sv.level === "good" ? "ok" : sv.level === "ok" ? "warn" : "bad"}>{sv.notes.join(" ")}</Notice>
        </>
      ) : null}

      {error ? <Notice kind="bad">{error}</Notice> : null}

      <div className="actions">
        <button className="btn primary" onClick={onNext} disabled={!report || running || testing}>
          {verdict && !verdict.pass ? "Continue anyway" : "Continue"}
        </button>
      </div>
    </section>
  );
}
