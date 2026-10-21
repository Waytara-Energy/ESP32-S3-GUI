import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { connectFlow, type ConnectedUnit, type ConnectOutcome } from "@/lib/connect-flow";
import type { HeardUnit } from "@/lib/radar";
import { NAV, canOpen, type PageId } from "@/lib/roles";
import { safeStorage } from "@/lib/theme";
import { forgetUnit, loadUnits, rememberUnit, type RememberedUnit } from "@/lib/units-store";
import { useServices, type Device } from "@/services";

export interface AppState {
  userId: string;
  email: string;
  role: string | null;
  page: PageId;
  go(page: PageId): void;
  /** the unit this page is connected to over Bluetooth, if any */
  unit: ConnectedUnit | null;
  /** the device being looked at: that of the connected unit, or one chosen from the remembered list */
  device: Device | null;
  setDevice(d: Device | null): void;
  /** the device's name was changed: keep the page's copies in step */
  renamed(label: string): void;
  /** a device is open without a Bluetooth connection (staff pages that use only the server) */
  offline: boolean;
  openOffline(d: Device): void;
  closeOffline(): void;
  remembered: RememberedUnit[];
  forget(hw: string): void;
  connecting: boolean;
  /** the unit being connected to, for the radar */
  connectingId: string | null;
  /** what the last scan found out, in words (a new unit, a unit that is not for this person, no access) */
  outcome: ConnectOutcome | null;
  /** the link ended on its own (the unit lets go of a quiet phone after 5 minutes) */
  linkLost: boolean;
  error: string | null;
  connect(target: HeardUnit): Promise<void>;
  disconnect(): void;
  /** re-reads the unit's own account of itself (after Wi-Fi or setup changes) */
  refreshUnit(): Promise<void>;
  /** settings that were saved and only reach the running unit after a restart (shown once, as a bar, whatever page they were saved on) */
  pendingRestart: string[];
  needsRestart(what: string): void;
  /** restarts the unit over Bluetooth (the link ends with it) and writes the activity log line */
  restartUnit(): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = (): AppState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
};

const hashPage = (): PageId => {
  const id = location.hash.replace(/^#\/?/, "") as PageId;
  return NAV.some((n) => n.id === id) ? id : "units";
};

export function AppProvider({ userId, email, children }: { userId: string; email: string; children: ReactNode }) {
  const services = useServices();
  const [role, setRole] = useState<string | null>(null);
  const [page, setPage] = useState<PageId>(hashPage);
  const [unit, setUnit] = useState<ConnectedUnit | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [remembered, setRemembered] = useState<RememberedUnit[]>(() => loadUnits(safeStorage(), userId));
  const [connecting, setConnecting] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [outcome, setOutcome] = useState<ConnectOutcome | null>(null);
  const [linkLost, setLinkLost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRestart, setPendingRestart] = useState<string[]>([]);
  const unitRef = useRef<ConnectedUnit | null>(null);
  unitRef.current = unit;

  useEffect(() => {
    let live = true;
    void services.myRole().then((r) => live && setRole(r));
    return () => {
      live = false;
    };
  }, [services]);

  useEffect(() => {
    const onHash = () => setPage(hashPage());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((p: PageId) => {
    location.hash = `/${p}`;
    setPage(p);
  }, []);

  const disconnect = useCallback(() => {
    unitRef.current?.link.disconnect();
    setUnit(null);
    setOutcome(null);
    setLinkLost(false);
    setOffline(false);
    setDevice(null);
    setPendingRestart([]);
    location.hash = "";
  }, []);

  // leaving the page (or signing out) lets go of the unit
  useEffect(() => () => unitRef.current?.link.disconnect(), []);

  const connect = useCallback(
    async (target: HeardUnit) => {
      setConnecting(true);
      setConnectingId(target.id);
      setError(null);
      setLinkLost(false);
      setPendingRestart([]);
      unitRef.current?.link.disconnect();
      try {
        const r = await connectFlow(services, target);
        if (r.kind === "cancelled") return;
        setOutcome(r);
        r.unit.link.onClosed = () => {
          setLinkLost(true);
          setUnit(null);
        };
        // A unit that lets this person do nothing is not worth a menu of locked pages: stay on the scan screen and say why.
        if (r.kind !== "ready" && r.unit.level < 1) {
          r.unit.link.disconnect();
          return;
        }
        setUnit(r.unit);
        if (r.unit.device) setDevice(r.unit.device);
        setRemembered(
          rememberUnit(safeStorage(), userId, {
            hw: r.unit.hw,
            name: r.unit.name,
            equipmentId: r.unit.device?.equipmentId ?? null,
            label: r.unit.device?.label ?? null,
            site: r.unit.device?.site ?? null,
            seenAt: Date.now(),
          }),
        );
        const first = r.kind === "ready" ? "overview" : "setup";
        setPage(first);
        location.hash = `/${first}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect to the unit.");
      } finally {
        setConnecting(false);
        setConnectingId(null);
      }
    },
    [services, userId],
  );

  const refreshUnit = useCallback(async () => {
    const u = unitRef.current;
    if (!u) return;
    try {
      const state = await u.link.state();
      setUnit((cur) => (cur && cur.link === u.link ? { ...cur, state, level: Math.max(cur.level, state.level ?? 0), fw: state.fw || cur.fw } : cur));
    } catch {
      /* the page that asked shows its own error */
    }
  }, []);

  const needsRestart = useCallback((what: string) => setPendingRestart((l) => (l.includes(what) ? l : [...l, what])), []);

  const restartUnit = useCallback(async () => {
    const u = unitRef.current;
    if (!u) throw new Error("The unit is not connected over Bluetooth.");
    await u.link.reboot();
    if (u.device) void services.logActivity(u.device.equipmentId, "unit_restarted", "The unit was restarted from the setup page").catch(() => undefined);
    disconnect();
  }, [services, disconnect]);

  const value = useMemo<AppState>(
    () => ({
      userId,
      email,
      role,
      page,
      go,
      unit,
      device,
      setDevice,
      renamed: (label) => {
        setDevice((d) => (d ? { ...d, label } : d));
        setUnit((u) => (u && u.device ? { ...u, device: { ...u.device, label } } : u));
        setRemembered((list) => {
          const hw = unitRef.current?.hw;
          const cur = list.find((x) => x.hw === hw);
          return cur ? rememberUnit(safeStorage(), userId, { ...cur, label }) : list;
        });
      },
      offline,
      openOffline: (d) => {
        setDevice(d);
        setOffline(true);
        setPage("activity");
        location.hash = "/activity";
      },
      closeOffline: () => {
        setOffline(false);
        setDevice(null);
        location.hash = "";
      },
      remembered,
      forget: (hw) => setRemembered(forgetUnit(safeStorage(), userId, hw)),
      connecting,
      connectingId,
      outcome,
      linkLost,
      error,
      connect,
      disconnect,
      refreshUnit,
      pendingRestart,
      needsRestart,
      restartUnit,
    }),
    [userId, email, role, page, go, unit, device, offline, remembered, connecting, connectingId, outcome, linkLost, error, connect, disconnect, refreshUnit, pendingRestart, needsRestart, restartUnit],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The page the person asked for, or the one they may open instead. */
export function useAllowedPage(): { page: PageId; allowed: boolean; reason: string | null } {
  const { page, unit, role, device } = useApp();
  const item = NAV.find((n) => n.id === page)!;
  const r = canOpen(item, { level: unit ? unit.level : null, role, hasDevice: !!device });
  return { page, allowed: r.ok, reason: r.ok ? null : r.reason };
}
