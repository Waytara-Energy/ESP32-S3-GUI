import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { applyTheme, readTheme } from "@/lib/theme";
import { Activity } from "@/pages/Activity";
import { Interval } from "@/pages/Interval";
import { Key } from "@/pages/Key";
import { Live } from "@/pages/Live";
import { Logs } from "@/pages/Logs";
import { RegisterMap } from "@/pages/Map";
import { Network } from "@/pages/Network";
import { Overview } from "@/pages/Overview";
import { Setup } from "@/pages/Setup";
import { Status } from "@/pages/Status";
import { Units } from "@/pages/Units";
import { ServicesContext, realServices, type Services } from "@/services";
import { Shell } from "@/Shell";
import { AppProvider, useAllowedPage, useApp } from "@/state";
import { SignIn } from "@/steps/SignIn";
import { Notice, PageHead, Spinner, Wordmark } from "@/ui";

function Page() {
  const { page, allowed, reason } = useAllowedPage();
  const { go } = useApp();
  if (!allowed) {
    return (
      <>
        <PageHead title="Not available" />
        <Notice kind="info">{reason}</Notice>
        <div className="actions">
          <button className="btn primary" onClick={() => go("units")}>
            Go to Units
          </button>
        </div>
      </>
    );
  }
  switch (page) {
    case "units":
      return <Units />;
    case "overview":
      return <Overview />;
    case "status":
      return <Status />;
    case "network":
      return <Network />;
    case "live":
      return <Live />;
    case "map":
      return <RegisterMap />;
    case "setup":
      return <Setup />;
    case "interval":
      return <Interval />;
    case "key":
      return <Key />;
    case "logs":
      return <Logs />;
    case "activity":
      return <Activity />;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [demo, setDemo] = useState<Services | null>(null);

  useEffect(() => {
    applyTheme(readTheme());
  }, []);

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

  async function signOut() {
    location.hash = "";
    if (!demo) await supabase.auth.signOut();
    else setSession(null);
  }

  return (
    <ServicesContext.Provider value={demo ?? realServices}>
      {!demo && !configured() ? (
        <div className="signin">
          <Wordmark />
          <Notice kind="bad">This page is not set up yet: the Supabase address and key were not provided when it was built.</Notice>
        </div>
      ) : session === undefined ? (
        <div className="center">
          <Spinner label="Loading" />
        </div>
      ) : session === null ? (
        <SignIn />
      ) : (
        <AppProvider key={session.user.id} userId={session.user.id} email={session.user.email ?? ""}>
          <Shell onSignOut={() => void signOut()}>
            <Page />
          </Shell>
        </AppProvider>
      )}
    </ServicesContext.Provider>
  );
}
