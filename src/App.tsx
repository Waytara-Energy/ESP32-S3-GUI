import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ClaimResult } from "@/ble/unit-link";
import { configured } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { Checks } from "@/steps/Checks";
import { Claim } from "@/steps/Claim";
import { Connect, type UnitSession } from "@/steps/Connect";
import { PickEquipment, type Equipment } from "@/steps/PickEquipment";
import { SignIn } from "@/steps/SignIn";
import { Wifi } from "@/steps/Wifi";
import { ServicesContext, realServices, type Services } from "@/services";
import { Logo, Notice, Spinner, Stepper, type Stage } from "@/ui";

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [stage, setStage] = useState<Stage>("pick");
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [unit, setUnit] = useState<UnitSession | null>(null);
  const [linkLost, setLinkLost] = useState(false);
  const [claimed, setClaimed] = useState<ClaimResult | null>(null);
  const [demo, setDemo] = useState<Services | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    // development only: `/?demo` runs the page against a fake unit (the import is removed from the production build)
    if (import.meta.env.DEV && location.search.includes("demo")) {
      void import("./dev/demo").then((m) => {
        setDemo(m.demoServices());
        setSession(m.demoSession);
      });
      return;
    }
    if (!configured()) {
      setSession(null);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const reset = useCallback(() => {
    unit?.link.disconnect();
    setUnit(null);
    setEquipment(null);
    setClaimed(null);
    setLinkLost(false);
    setStage("pick");
  }, [unit]);

  async function signOut() {
    unit?.link.disconnect();
    setUnit(null);
    setEquipment(null);
    setClaimed(null);
    setStage("pick");
    await supabase.auth.signOut();
  }

  function connected(s: UnitSession) {
    setLinkLost(false);
    s.link.onClosed = () => {
      // the unit restarts as soon as it is claimed, which ends the link on purpose
      if (stageRef.current !== "done") setLinkLost(true);
    };
    setUnit(s);
  }

  async function finished(result: ClaimResult) {
    setClaimed(result);
    setStage("done");
    await unit?.link.closeSetup();
    unit?.link.disconnect();
  }

  const goBackToConnect = () => {
    setUnit(null);
    setLinkLost(false);
    setStage("connect");
  };

  return (
    <ServicesContext.Provider value={demo ?? realServices}>
    <div className="shell">
      <header className="top">
        <div className="brand">
          <Logo />
          <span>WayTara Unit Setup</span>
        </div>
        {session ? (
          <div className="who">
            <span>{session.user.email}</span>
            <button className="btn link" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      {!demo && !configured() ? (
        <Notice kind="bad">This page is not set up yet: the Supabase address and key were not provided when it was built.</Notice>
      ) : session === undefined ? (
        <div className="center">
          <Spinner label="Loading" />
        </div>
      ) : session === null ? (
        <SignIn />
      ) : (
        <>
          <Stepper stage={stage} />
          {linkLost && stage !== "pick" && stage !== "connect" ? (
            <div className="card">
              <Notice kind="warn">The Bluetooth connection to the unit was lost. Hold BOOT for 3 seconds if its setup window closed, then connect again. Your choices are kept.</Notice>
              <div className="actions">
                <button className="btn primary" onClick={goBackToConnect}>
                  Connect again
                </button>
              </div>
            </div>
          ) : null}

          {stage === "pick" ? (
            <>
              <PickEquipment selected={equipment} onPick={setEquipment} />
              <div className="actions">
                <button className="btn primary" disabled={!equipment} onClick={() => setStage("connect")}>
                  Continue
                </button>
              </div>
            </>
          ) : null}
          {stage === "connect" && equipment ? (
            <>
              <Connect session={unit} equipmentName={equipment.name} onConnected={connected} onNext={() => setStage("wifi")} />
              <div className="actions">
                <button className="btn link" onClick={() => setStage("pick")}>
                  Back
                </button>
              </div>
            </>
          ) : null}
          {stage === "wifi" && unit && !linkLost ? <Wifi session={unit} onJoined={() => undefined} onNext={() => setStage("checks")} /> : null}
          {stage === "checks" && unit && !linkLost ? <Checks session={unit} claimed={unit.info.claimed} onNext={() => setStage("claim")} /> : null}
          {stage === "claim" && unit && equipment && !linkLost ? <Claim session={unit} equipment={equipment} onDone={(r) => void finished(r)} /> : null}
          {stage === "done" && equipment ? (
            <section className="card center">
              <div className="big" aria-hidden>
                ✓
              </div>
              <h1>The unit is set up</h1>
              <p>
                It now reports as <strong>{equipment.name}</strong> at {equipment.site}. It restarts, joins Wi-Fi and connects to WayTara. The device shows <strong>online</strong> in the dashboard within a few minutes.
              </p>
              {claimed ? <p className="sub">Linked: key {claimed.key_id.slice(0, 8)}…</p> : null}
              <div className="actions" style={{ justifyContent: "center" }}>
                <button className="btn primary" onClick={reset}>
                  Set up another unit
                </button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
    </ServicesContext.Provider>
  );
}
