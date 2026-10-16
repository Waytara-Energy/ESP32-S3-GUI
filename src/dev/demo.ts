// Development only (`/?demo` on the dev server): the whole page against a fake unit, so every screen can be looked at without a radio, a
// sign-in or a unit. This file is reached only through a dynamic import guarded by import.meta.env.DEV, so it is not in the production build.
import type { Session } from "@supabase/supabase-js";
import { fakeUnit } from "@/ble/fake-unit";
import { UnitLink } from "@/ble/unit-link";
import type { Services } from "@/services";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoSession = { user: { email: "installer@example.com" } } as unknown as Session;

export function demoServices(): Services {
  return {
    bluetoothAvailable: () => true,
    async listEquipment() {
      await pause(400);
      return [
        { id: "11111111-1111-4111-8111-111111111111", site: "ECR Villa", name: "Deye 8 kW hybrid", model: "SUN-8K-SG04LP3" },
        { id: "22222222-2222-4222-8222-222222222222", site: "ECR Villa", name: "Deye 5 kW hybrid", model: "SUN-5K-SG03LP1" },
        { id: "33333333-3333-4333-8333-333333333333", site: "Waytara Office", name: "Inverter 1", model: null },
      ];
    },
    async connectUnit() {
      await pause(900);
      const unit = await fakeUnit({ delayMs: 700 });
      const link = new UnitLink(unit.transport);
      const info = await link.connect();
      return { link, info, name: "WayTara-5505D0" };
    },
    async issueTicket() {
      await pause(500);
      return "99999999-9999-4999-8999-999999999999";
    },
  };
}
