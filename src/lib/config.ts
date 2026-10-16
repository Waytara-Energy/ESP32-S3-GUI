// Public settings, put into the page when it is built (Vite only exposes names that start with VITE_). None of them is a secret.
const env = import.meta.env as Record<string, string | undefined>;

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? "";
export const GATEWAY_URL = env.VITE_GATEWAY_URL ?? "https://hub.waytaraenergy.com";

export const configured = (): boolean => SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
