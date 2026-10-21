import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { connectFlow, type ConnectedUnit, type ConnectOutcome } from "@/lib/connect-flow";
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
  remembered: RememberedUnit[];
  forget(hw: string): void;
  connecting: boolean;
  /** what the last scan found out, in words (a new unit, a unit that is not for this person, no access) */
  outcome: ConnectOutcome | null;
  /** the link ended on its own (the unit lets go of a quiet phone after 5 minutes) */
  linkLost: boolean;
  error: string | null;
  connect(preferName?: string): Promise<void>;
  disconnect(): void;
  /** re-reads the unit's own account of itself (after Wi-Fi or setup changes) */
  refreshUnit(): Promise<void>;
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
  const [outcome, setOutcome] = useState<ConnectOutcome | null>(null);
  const [linkLost, setLinkLost] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, []);

  // leaving the page (or signing out) lets go of the unit
  useEffect(() => () => unitRef.current?.link.disconnect(), []);

  const connect = useCallback(
    async (preferName?: string) => {
      setConnecting(true);
      setError(null);
      setLinkLost(false);
      unitRef.current?.link.disconnect();
      try {
        const r = await connectFlow(services, preferName);
        if (r.kind === "cancelled") return;
        setOutcome(r);
        r.unit.link.onClosed = () => {
          setLinkLost(true);
          setUnit(null);
        };
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
        if (r.kind === "ready") setPage((p) => (p === "units" ? "overview" : p));
        if (r.kind === "ready") location.hash = "/overview";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect to the unit.");
      } finally {
        setConnecting(false);
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
      remembered,
      forget: (hw) => setRemembered(forgetUnit(safeStorage(), userId, hw)),
      connecting,
      outcome,
      linkLost,
      error,
      connect,
      disconnect,
      refreshUnit,
    }),
    [userId, email, role, page, go, unit, device, remembered, connecting, outcome, linkLost, error, connect, disconnect, refreshUnit],
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
