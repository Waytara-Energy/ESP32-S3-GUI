// Development only (`/?demo` on the dev server): the whole page against a fake unit, so every screen can be looked at without a radio, a
// sign-in or a unit. This file is reached only through a dynamic import guarded by import.meta.env.DEV, so it is not in the production build.
// `/?demo&role=customer|employee|admin` shows the page as that person (the unit's grant level follows the role, as the hub would give it).
import type { Session } from "@supabase/supabase-js";
import { fakeUnit } from "@/ble/fake-unit";
import { UnitLink } from "@/ble/unit-link";
import type { Services } from "@/services";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoSession = { user: { id: "demo-user", email: "installer@example.com" } } as unknown as Session;

const EQ = "11111111-1111-4111-8111-111111111111";

export function demoServices(): Services {
  const role = new URLSearchParams(location.search).get("role") ?? "admin";
  const level = role === "customer" ? 2 : role === "admin" ? 4 : 3;
  let intervalS = 900;
  return {
    bluetoothAvailable: () => true,
    async myRole() {
      return role === "employee" ? "employee" : role;
    },
    async listEquipment() {
      await pause(400);
      return [
        { id: EQ, site: "ECR Villa", name: "Deye 8 kW hybrid", model: "SUN-8K-SG04LP3" },
        { id: "22222222-2222-4222-8222-222222222222", site: "ECR Villa", name: "Deye 5 kW hybrid", model: "SUN-5K-SG03LP1" },
        { id: "33333333-3333-4333-8333-333333333333", site: "Waytara Office", name: "Inverter 1", model: null },
      ];
    },
    async connectUnit() {
      await pause(900);
      const unit = await fakeUnit({ delayMs: 400, level: 0, claimedAs: EQ, hw: "2884855505D0" });
      const link = new UnitLink(unit.transport);
      const info = await link.connect();
      // a little stream of logs and readings, as the unit would send once asked
      let n = 0;
      let round = 0;
      setInterval(() => {
        if (unit.state.level < 1) return;
        void unit.sendJson({ log: [[++n, `[${Date.now() % 100000}] demo   heartbeat sent, queue 3`]] });
        void unit.sendJson({ live: ++round, t: Date.now(), b: [[186, "0" + String(400 + (round % 9) * 10).padStart(3, "0")], [184, "0050"]], more: false });
      }, 2000);
      return { link, info, name: "WayTara-5505D0" };
    },
    async resolveUnit() {
      await pause(200);
      return { equipmentId: EQ, label: "Deye 8 kW hybrid", site: "ECR Villa" };
    },
    async requestGrant() {
      await pause(200);
      return { grant: `grant-${level}`, level, level_name: level === 4 ? "admin" : level === 3 ? "service" : "network", expires_in: 120 };
    },
    async issueTicket() {
      await pause(500);
      return "99999999-9999-4999-8999-999999999999";
    },
    async decode() {
      await pause(150);
      const r = Math.round(Date.now() / 2000) % 9;
      return [
        { key: "pv1_power_w", label: "PV1 power", unit: "W", group: "Solar", value: 400 + r * 10, in_range: true },
        { key: "battery_soc_pct", label: "Battery charge", unit: "%", group: "Battery", value: 80, in_range: true },
        ...(role === "customer" ? [] : [{ key: "internal_temp_c", label: "Heat sink temperature", unit: "°C", group: "Inverter", value: 41.5, in_range: true }]),
      ];
    },
    async getInterval() {
      return { seconds: intervalS, allowed: [60, 120, 300, 600, 900, 1800, 3600], default: 900 };
    },
    async setInterval(_id, seconds) {
      intervalS = seconds;
      return { seconds, allowed: [60, 120, 300, 600, 900, 1800, 3600] };
    },
    async rotationStatus() {
      return { state: "idle", rotation_id: null, started_at: null, expires_at: null, can_start: true, reason: null };
    },
    async startRotation() {
      return { state: "sent", rotation_id: "r1", started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600_000).toISOString(), can_start: false, reason: null };
    },
    async activity() {
      await pause(300);
      return [
        { id: 3, at: new Date(Date.now() - 3_600_000).toISOString(), actor_name: "Asha Rao", actor_role: "employee", source: "bluetooth", action: "wifi_changed", summary: 'The Wi-Fi network "Home" was added and joined', details: null },
        { id: 2, at: new Date(Date.now() - 86_400_000).toISOString(), actor_name: null, actor_role: null, source: "hub", action: "device_online", summary: "The unit came back online after 12 minutes", details: null },
        { id: 1, at: new Date(Date.now() - 172_800_000).toISOString(), actor_name: "Admin", actor_role: "admin", source: "setup_page", action: "unit_claimed", summary: "The unit was set up for this device", details: null },
      ];
    },
    async logActivity() {
      return;
    },
    async metrics() {
      return [
        { key: "pv1_power_w", direction: "read", registers: [186], category: "Solar", cadence: 5 },
        { key: "battery_soc_pct", direction: "read", registers: [184], category: "Battery", cadence: 5 },
      ];
    },
  };
}
