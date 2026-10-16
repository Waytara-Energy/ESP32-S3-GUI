// Talks to the WayTara backend (the hub), signed in as the person using the page. Runs in the browser. The only thing this page asks the
// hub for is a single-use claim ticket; the hub decides whether this person may set up that device, and this code only reports its answer.

export class GatewayApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GatewayApiError";
    this.status = status;
  }
}

export interface GatewayClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

const plainMessage = (status: number): string =>
  status === 401
    ? "Please sign in again."
    : status === 404
      ? "You can't set up this device, or it no longer exists."
      : status === 409
        ? "That conflicts with the current state. Refresh the page and look again."
        : status === 429
          ? "Too many requests. Wait a minute and try again."
          : status >= 500
            ? "The service is unavailable right now. Try again in a moment."
            : "The request was not accepted.";

export function createGatewayClient(o: GatewayClientOptions) {
  const base = o.baseUrl.replace(/\/+$/, "");
  const doFetch = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function post<T>(path: string, body: unknown): Promise<T> {
    const token = await o.getToken();
    if (!token) throw new GatewayApiError(401, plainMessage(401));
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new GatewayApiError(0, "Could not reach the service. Check your connection and try again.");
    }
    if (!res.ok) throw new GatewayApiError(res.status, plainMessage(res.status));
    return (await res.json()) as T;
  }

  return {
    /** A single-use ticket (valid 15 minutes) that lets one board, named by its hardware id, collect the key of this equipment. */
    issueClaimTicket(equipmentId: string, hardwareId: string): Promise<{ ticket: string; expires_at: string }> {
      return post(`/v1/equipment/${encodeURIComponent(equipmentId)}/claim-tickets`, { hardware_id: hardwareId });
    },
  };
}

export type GatewayClient = ReturnType<typeof createGatewayClient>;
