import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/** The signed-in person's session lives in this browser only (supabase-js keeps it in local storage). Every query goes to the waytara schema.
 *  The client is not given the generated table types of the main repository; the one query this page makes types its own rows. */
export const supabase = createClient<any, "waytara">(SUPABASE_URL || "http://localhost", SUPABASE_ANON_KEY || "missing", {
  db: { schema: "waytara" },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
