import { useState } from "react";
import { GatewayApiError } from "@/lib/gateway-api";
import { UnitError, type ClaimResult } from "@/ble/unit-link";
import type { ConnectedUnit } from "@/lib/connect-flow";
import type { Equipment } from "./PickEquipment";
import { claimMessage } from "@/lib/messages";
import { useServices } from "@/services";
import { Notice, Spinner } from "@/ui";

type Phase = "idle" | "ticket" | "unit";

export function Claim({ unit, equipment, onDone }: { unit: ConnectedUnit; equipment: Equipment; onDone: (r: ClaimResult) => void }) {
  const services = useServices();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setError(null);
    try {
      setPhase("ticket");
      // A single-use ticket for exactly this unit and this device, valid for 15 minutes.
      const ticket = await services.issueTicket(equipment.id, unit.hw);
      setPhase("unit");
      const result = await unit.link.claim(ticket);
      onDone(result);
    } catch (e) {
      if (e instanceof GatewayApiError) {
        setError(e.status === 404 ? "You are not allowed to set up a unit for this device, or it no longer exists." : e.message);
      } else if (e instanceof UnitError) {
        setError(e.kind === "refused" ? claimMessage(e.message) : e.message);
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  return (
    <section className="card">
      <h2>Finish setup</h2>
      <p className="sub">This links the unit to the device. After this, the unit restarts and starts sending data.</p>
      <dl className="kv">
        <dt>Device</dt>
        <dd>
          {equipment.name} · {equipment.site}
        </dd>
        <dt>Unit</dt>
        <dd className="mono">{unit.hw}</dd>
      </dl>
      {error ? <Notice kind="bad">{error}</Notice> : null}
      <div className="actions">
        <button className="btn primary" onClick={finish} disabled={busy}>
          {phase === "ticket" ? <Spinner label="Getting a setup ticket" /> : phase === "unit" ? <Spinner label="Linking the unit" /> : error ? "Try again" : "Finish setup"}
        </button>
      </div>
    </section>
  );
}
