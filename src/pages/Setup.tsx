import { useState } from "react";
import type { ClaimResult } from "@/ble/unit-link";
import { PickEquipment, type Equipment } from "@/steps/PickEquipment";
import { Checks } from "@/steps/Checks";
import { Claim } from "@/steps/Claim";
import { useApp } from "@/state";
import { Notice, PageHead, Stepper, type Stage } from "@/ui";

/** Setting up a unit: choose the device it belongs to, check its connection, then link it. Needs the administrator level or the unit's setup window. */
export function Setup() {
  const { unit, disconnect, go, setDevice } = useApp();
  const [stage, setStage] = useState<Stage>("pick");
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [claimed, setClaimed] = useState<ClaimResult | null>(null);
  if (!unit) return null;

  async function finished(r: ClaimResult) {
    setClaimed(r);
    setStage("done");
    await unit?.link.closeSetup();
  }

  return (
    <>
      <PageHead title="Setup" sub="Link this unit to the device it is wired to. Join its Wi-Fi first on the Network page." />
      {stage !== "done" ? <Stepper stage={stage} /> : null}

      {!unit.state?.wifi && stage !== "done" ? (
        <Notice kind="warn">
          The unit is not on Wi-Fi yet. Open <button className="btn link" onClick={() => go("network")}>Network</button> and join a network, then come back here.
        </Notice>
      ) : null}

      {stage === "pick" ? (
        <>
          <PickEquipment selected={equipment} onPick={setEquipment} />
          {unit.claimed && equipment ? <Notice kind="warn">This unit already belongs to a device. Finishing setup replaces that: it will report as {equipment.name} from now on.</Notice> : null}
          <div className="actions">
            <button className="btn primary" disabled={!equipment} onClick={() => setStage("checks")}>
              Continue
            </button>
          </div>
        </>
      ) : null}
      {stage === "checks" ? <Checks unit={unit} claimed={unit.claimed} onNext={() => setStage("claim")} /> : null}
      {stage === "claim" && equipment ? <Claim unit={unit} equipment={equipment} onDone={(r) => void finished(r)} /> : null}
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
            <button
              className="btn primary"
              onClick={() => {
                setDevice({ equipmentId: equipment.id, label: equipment.name, site: equipment.site });
                disconnect();
                go("units");
              }}
            >
              Done
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
