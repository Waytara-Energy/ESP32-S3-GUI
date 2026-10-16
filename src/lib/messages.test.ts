import { describe, expect, it } from "vitest";
import { checksVerdict, claimMessage, signalLabel, speedVerdict } from "./messages";

const step = (name: string, ok: boolean, skipped = false, detail = "") => ({ name, ok, skipped, ms: 5, detail });

describe("the checks", () => {
  it("passes when every step passed and the live link is skipped only because the unit is not claimed yet", () => {
    const report = { steps: [step("wifi", true), step("dns", true), step("time", true), step("tls", true), step("backend", true), step("mqtt", false, true, "this unit has no key yet")], all_ok: false };
    expect(checksVerdict(report, false).pass).toBe(true);
    expect(checksVerdict(report, true).pass).toBe(false); // once claimed, a skipped live link is a problem
  });

  it("names the first step that failed", () => {
    const report = { steps: [step("wifi", true), step("dns", false, false, "no answer"), step("time", false, true)], all_ok: false };
    const v = checksVerdict(report, false);
    expect(v.pass).toBe(false);
    expect(v.text).toBe("Finding the WayTara server did not pass: no answer.");
  });
});

describe("signal and speed", () => {
  it("puts a signal into words", () => {
    expect(signalLabel(-50).label).toBe("Excellent");
    expect(signalLabel(-72).label).toBe("Fair");
    expect(signalLabel(-90).label).toBe("Very weak");
  });

  it("calls a fast link good and says what is wrong with a weak one", () => {
    expect(speedVerdict({ rssi: -55, channel: 6, rtt_ms: 120, down_kbps: 4000, up_kbps: 2000 })).toMatchObject({ level: "good" });
    const poor = speedVerdict({ rssi: -84, channel: 1, rtt_ms: 200, down_kbps: 900, up_kbps: 300 });
    expect(poor.level).toBe("poor");
    expect(poor.notes[0]).toMatch(/very weak/);
    expect(speedVerdict({ rssi: -60, channel: 1, rtt_ms: 800, down_kbps: 900, up_kbps: 60 }).level).toBe("ok");
  });
});

describe("claim messages", () => {
  it("turns the unit's reasons into advice", () => {
    expect(claimMessage("locked for a minute after three wrong tries")).toMatch(/Wait a minute/);
    expect(claimMessage("the ticket was not accepted")).toMatch(/fresh one/);
    expect(claimMessage("something new")).toBe("something new");
  });
});
