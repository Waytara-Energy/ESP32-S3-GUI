// The words the page uses for what the unit reports. Pure functions, tested without a browser.

import type { CheckReport, CheckStep, SpeedResult } from "@/ble/unit-link";

export function signalLabel(rssi: number): { label: string; level: 0 | 1 | 2 | 3 } {
  if (rssi >= -55) return { label: "Excellent", level: 3 };
  if (rssi >= -67) return { label: "Good", level: 3 };
  if (rssi >= -75) return { label: "Fair", level: 2 };
  if (rssi >= -85) return { label: "Weak", level: 1 };
  return { label: "Very weak", level: 0 };
}

const TITLES: Record<string, string> = {
  wifi: "Wi-Fi connection",
  dns: "Finding the WayTara server",
  time: "Clock",
  tls: "Secure connection",
  backend: "WayTara server answers",
  mqtt: "Live data link",
};
export const checkTitle = (name: string): string => TITLES[name] ?? name;

export type StepState = "ok" | "failed" | "skipped";
export const stepState = (s: CheckStep): StepState => (s.skipped ? "skipped" : s.ok ? "ok" : "failed");

/** What the checks mean for the installer. A skipped "live data link" before the unit is claimed is expected, not a problem. */
export function checksVerdict(report: CheckReport, claimed: boolean): { pass: boolean; failed: CheckStep[]; text: string } {
  const failed = report.steps.filter((s) => !s.skipped && !s.ok);
  const blockedBy = report.steps.filter((s) => s.skipped && !(s.name === "mqtt" && !claimed));
  if (failed.length === 0 && blockedBy.length === 0) return { pass: true, failed, text: "Everything the unit needs is reachable." };
  if (failed.length > 0) return { pass: false, failed, text: `${checkTitle(failed[0]!.name)} did not pass: ${failed[0]!.detail || "no detail"}.` };
  return { pass: false, failed, text: "Some checks could not run because an earlier one did not pass." };
}

export type SpeedLevel = "good" | "ok" | "poor";

/** The unit sends about one kilobyte every few seconds, so even a slow link is enough; a very weak signal or a long delay is the risk. */
export function speedVerdict(r: SpeedResult): { level: SpeedLevel; notes: string[] } {
  const notes: string[] = [];
  let level: SpeedLevel = "good";
  const worsen = (to: SpeedLevel) => {
    if (to === "poor" || level === "good") level = to;
  };
  if (r.rssi < -80) {
    notes.push("The Wi-Fi signal at the unit is very weak. Move the router closer or add an access point.");
    worsen("poor");
  } else if (r.rssi < -70) {
    notes.push("The Wi-Fi signal at the unit is weak; it may drop out.");
    worsen("ok");
  }
  if (r.up_kbps < 20) {
    notes.push("Upload speed is very low.");
    worsen("poor");
  } else if (r.up_kbps < 100) {
    notes.push("Upload speed is low but workable.");
    worsen("ok");
  }
  if (r.rtt_ms > 1500) {
    notes.push("The delay to the server is very long.");
    worsen("poor");
  } else if (r.rtt_ms > 600) {
    notes.push("The delay to the server is long.");
    worsen("ok");
  }
  if (notes.length === 0) notes.push("The connection is fast enough for live data.");
  return { level, notes };
}

export const kbit = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)} Mbit/s` : `${Math.round(n)} kbit/s`);

/** The unit's reasons are short and technical; these are the ones an installer can act on. */
export function claimMessage(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("locked")) return "The unit is locked for a minute after three wrong tries. Wait a minute, then try again.";
  if (r.includes("expired") || r.includes("ticket")) return "The setup ticket was not accepted or has expired. Go back one step and try again to get a fresh one.";
  if (r.includes("clock") || r.includes("time")) return "The unit's clock is not set yet. Check the Wi-Fi connection and try again.";
  if (r.includes("wi-fi") || r.includes("wifi") || r.includes("network")) return "The unit has no internet. Check the Wi-Fi step first.";
  return reason;
}
