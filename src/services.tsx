import { createContext, useContext } from "react";
import type { UnitInfo } from "@/ble/unit-link";
import { UnitLink } from "@/ble/unit-link";
import { connectToUnit, webBluetoothAvailable } from "@/ble/web-bluetooth";
import { GATEWAY_URL } from "@/lib/config";
import { createGatewayClient, type BleGrant, type DecodedValue, type IntervalInfo, type RotationInfo } from "@/lib/gateway-api";
import { supabase } from "@/lib/supabase";

export interface Equipment {
  id: string;
  site: string;
  name: string;
  model: string | null;
}

/** A device this person can see: what a unit that was found belongs to. */
export interface Device {
  equipmentId: string;
  label: string;
  site: string;
}

export interface UnitSession {
  link: UnitLink;
  info: UnitInfo;
  name: string;
}

export interface ActivityRow {
  id: number;
  at: string;
  actor_name: string | null;
  actor_role: string | null;
  source: string;
  action: string;
  summary: string;
  details: Record<string, unknown> | null;
}

/** What a value of the register map is called, for the Register map page. */
export interface MetricInfo {
  key: string;
  direction: string;
  registers: number[];
  category: string | null;
  cadence: number | null;
}

/** Everything the page reaches outside itself, in one place, so the demo page can swap it for a fake unit. */
export interface Services {
  bluetoothAvailable(): boolean;
  /** the signed-in person's role (admin, employee, site_engineer, customer) */
  myRole(): Promise<string | null>;
  /** the inverters this person may set a monitoring unit up for (the database decides which ones they can see) */
  listEquipment(): Promise<Equipment[]>;
  /** asks the person to choose a unit (or, given a remembered name, only that one), connects and agrees the key; null when they chose none */
  connectUnit(preferName?: string): Promise<UnitSession | null>;
  /** the device a unit belongs to, if this person may see it (a unit that is unknown and one at somebody else's site look the same) */
  resolveUnit(hardwareId: string): Promise<Device | null>;
  /** a two-minute pass for this person on this unit's current Bluetooth connection */
  requestGrant(equipmentId: string, unitPublicKey: string): Promise<BleGrant>;
  /** a single-use ticket for this unit and this device, valid 15 minutes */
  issueTicket(equipmentId: string, hardwareId: string): Promise<string>;
  /** raw live register blocks as values (the hub decodes) */
  decode(equipmentId: string, blocks: [number, string][]): Promise<DecodedValue[]>;
  getInterval(equipmentId: string): Promise<IntervalInfo>;
  setInterval(equipmentId: string, seconds: number): Promise<IntervalInfo>;
  rotationStatus(equipmentId: string): Promise<RotationInfo>;
  startRotation(equipmentId: string): Promise<RotationInfo>;
  activity(equipmentId: string): Promise<ActivityRow[]>;
  /** writes what was done over Bluetooth into the unit's activity log (best effort; never a password or key) */
  logActivity(equipmentId: string, action: "wifi_changed" | "wifi_removed" | "unit_restarted", summary: string): Promise<void>;
  metrics(equipmentId: string): Promise<MetricInfo[]>;
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
  async myRole() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await supabase.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (error) return null;
    return (data as { role?: string } | null)?.role ?? null;
  },
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
  async connectUnit(preferName) {
    try {
      const { transport, name } = await connectToUnit(preferName);
      const link = new UnitLink(transport);
      const info = await link.connect();
      return { link, info, name };
    } catch (e) {
      if (e instanceof Error && e.name === "BluetoothCancelled") return null;
      throw e;
    }
  },
  async resolveUnit(hardwareId) {
    const { data, error } = await supabase.rpc("my_unit_by_hardware", { p_hardware_id: hardwareId });
    if (error) throw new Error(error.message);
    const row = (data as { equipment_id: string; label: string; site_name: string }[] | null)?.[0];
    return row ? { equipmentId: row.equipment_id, label: row.label, site: row.site_name } : null;
  },
  requestGrant: (equipmentId, pub) => gateway.bleGrant(equipmentId, pub),
  async issueTicket(equipmentId, hardwareId) {
    return (await gateway.issueClaimTicket(equipmentId, hardwareId)).ticket;
  },
  decode: (equipmentId, blocks) => gateway.decode(equipmentId, blocks),
  getInterval: (equipmentId) => gateway.getInterval(equipmentId),
  setInterval: (equipmentId, seconds) => gateway.setInterval(equipmentId, seconds),
  rotationStatus: (equipmentId) => gateway.rotationStatus(equipmentId),
  startRotation: (equipmentId) => gateway.startRotation(equipmentId),
  async activity(equipmentId) {
    const { data, error } = await supabase
      .from("device_activity_log")
      .select("id, at, actor_name, actor_role, source, action, summary, details")
      .eq("equipment_id", equipmentId)
      .order("at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityRow[];
  },
  async logActivity(equipmentId, action, summary) {
    const { error } = await supabase.rpc("log_device_activity", { p_equipment: equipmentId, p_action: action, p_summary: summary, p_details: {}, p_via: "bluetooth" });
    if (error) throw new Error(error.message);
  },
  async metrics(equipmentId) {
    const { data, error } = await supabase.from("equipment_metrics").select("key_name, direction, address, category, cadence_seconds").eq("equipment_id", equipmentId).limit(1000);
    if (error) return [];
    return ((data ?? []) as { key_name: string; direction: string; address: { registers?: number[] } | null; category: string | null; cadence_seconds: number | null }[]).map((m) => ({
      key: m.key_name,
      direction: m.direction,
      registers: m.address?.registers ?? [],
      category: m.category,
      cadence: m.cadence_seconds,
    }));
  },
};

export const ServicesContext = createContext<Services>(realServices);
export const useServices = (): Services => useContext(ServicesContext);
