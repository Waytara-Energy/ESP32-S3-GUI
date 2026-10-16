import { createContext, useContext } from "react";
import type { UnitInfo } from "@/ble/unit-link";
import { UnitLink } from "@/ble/unit-link";
import { connectToUnit, webBluetoothAvailable } from "@/ble/web-bluetooth";
import { GATEWAY_URL } from "@/lib/config";
import { createGatewayClient } from "@/lib/gateway-api";
import { supabase } from "@/lib/supabase";

export interface Equipment {
  id: string;
  site: string;
  name: string;
  model: string | null;
}

export interface UnitSession {
  link: UnitLink;
  info: UnitInfo;
  name: string;
}

/** Everything the page reaches outside itself, in one place, so the demo page can swap it for a fake unit. */
export interface Services {
  bluetoothAvailable(): boolean;
  /** the inverters this person may set a monitoring unit up for (the database decides which ones they can see) */
  listEquipment(): Promise<Equipment[]>;
  /** asks the person to choose a unit, connects and agrees the key; null when they chose none */
  connectUnit(): Promise<UnitSession | null>;
  /** a single-use ticket for this unit and this device, valid 15 minutes */
  issueTicket(equipmentId: string, hardwareId: string): Promise<string>;
}

/** One row of the device list query below. */
interface EquipmentRow {
  id: string;
  label: string | null;
  site: { name: string | null } | null;
  device_type: { category: string | null; name: string | null; model_number: string | null } | null;
}

const gateway = createGatewayClient({
  baseUrl: GATEWAY_URL,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
});

export const realServices: Services = {
  bluetoothAvailable: webBluetoothAvailable,
  async listEquipment() {
    const { data, error } = await supabase
      .from("equipment")
      .select("id, label, parent_id, retired_at, site:sites(name), device_type:equipment_inventory(category, name, model_number)")
      .is("parent_id", null)
      .is("retired_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as EquipmentRow[])
      .filter((d) => d.device_type?.category === "solar_inverter")
      .map((d) => ({ id: d.id, site: d.site?.name ?? "Unnamed site", name: d.label?.trim() || d.device_type?.name || "Inverter", model: d.device_type?.model_number ?? null }))
      .sort((a, b) => a.site.localeCompare(b.site) || a.name.localeCompare(b.name));
  },
  async connectUnit() {
    try {
      const { transport, name } = await connectToUnit();
      const link = new UnitLink(transport);
      const info = await link.connect();
      return { link, info, name };
    } catch (e) {
      if (e instanceof Error && e.name === "BluetoothCancelled") return null;
      throw e;
    }
  },
  async issueTicket(equipmentId, hardwareId) {
    return (await gateway.issueClaimTicket(equipmentId, hardwareId)).ticket;
  },
};

export const ServicesContext = createContext<Services>(realServices);
export const useServices = (): Services => useContext(ServicesContext);
