import { useState } from "react";
import { GatewayApiError } from "@/lib/gateway-api";
import { UnitError, type ClaimResult } from "@/ble/unit-link";
import type { UnitSession } from "./Connect";
import type { Equipment } from "./PickEquipment";
import { claimMessage } from "@/lib/messages";
import { useServices } from "@/services";
import { Notice, Spinner } from "@/ui";

type Phase = "idle" | "ticket" | "unit";

export function Claim({ session, equipment, onDone }: { session: UnitSession; equipment: Equipment; onDone: (r: ClaimResult) => void }) {
  const services = useServices();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setError(null);
    try {
      setPhase("ticket");
      // A single-use ticket for exactly this unit and this device, valid for 15 minutes.
      const ticket = await services.issueTicket(equipment.id, session.info.hw);
      setPhase("unit");
      const result = await session.link.claim(ticket);
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
      <h1>Finish setup</h1>
      <p className="sub">This links the unit to the device. After this, the unit restarts and starts sending data.</p>
      <dl className="kv">
        <dt>Device</dt>
        <dd>
          {equipment.name} · {equipment.site}
        </dd>
        <dt>Unit</dt>
        <dd>{session.info.hw}</dd>
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
