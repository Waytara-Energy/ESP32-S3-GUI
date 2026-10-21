import { useEffect, useRef, useState } from "react";
import type { ScanCapabilities } from "@/ble/web-bluetooth";
import { RadarModel, type Blip, type HeardUnit } from "@/lib/radar";
import { useServices } from "@/services";

/**
 * Starts the radar when the page that shows it appears, with no click, and stops it when it goes. Returns the units on the radar now (the list
 * refreshes a few times a second and every second so a unit that went quiet leaves), what the browser is really listening for, and a way to
 * add a unit the browser has not been allowed to use yet (the browser's own confirmation, once per unit).
 */
export function useRadar(active: boolean): { blips: Blip[]; listening: ScanCapabilities | null; error: string | null; allow: (name?: string) => Promise<void> } {
  const services = useServices();
  const model = useRef(new RadarModel());
  const [blips, setBlips] = useState<Blip[]>([]);
  const [listening, setListening] = useState<ScanCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastPaint = useRef(0);

  useEffect(() => {
    if (!active) return;
    let live = true;
    let stop: (() => void) | null = null;
    const paint = () => live && setBlips(model.current.visible(Date.now()));
    const hear = (h: HeardUnit) => {
      const isNew = model.current.hear(h, Date.now());
      const now = Date.now();
      if (isNew || now - lastPaint.current > 250) {
        lastPaint.current = now;
        paint();
      }
    };
    services.startScan(hear).then(
      (s) => {
        if (!live) return s.stop();
        stop = s.stop;
        setListening(s.listening);
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : "Could not start the scan."),
    );
    const timer = setInterval(paint, 1000);
    return () => {
      live = false;
      clearInterval(timer);
      stop?.();
      model.current.clear();
      setBlips([]);
    };
  }, [active, services]);

  async function allow(name?: string): Promise<void> {
    setError(null);
    try {
      const h = await services.allowUnit(name);
      if (h) {
        model.current.hear(h, Date.now());
        setBlips(model.current.visible(Date.now()));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the unit.");
    }
  }

  return { blips, listening, error, allow };
}
