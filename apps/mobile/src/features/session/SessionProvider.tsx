import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { setApiToken } from "../../lib/api.ts";
import { tokenStore } from "./token-store.ts";

type Status = "loading" | "signedOut" | "signedIn";
type Session = { status: Status; signIn: (token: string) => Promise<void>; signOut: () => Promise<void> };

const SessionContext = createContext<Session | null>(null);

/** Loads the stored token once at launch and keeps the API client's copy in step. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    tokenStore
      .load()
      .then((token) => {
        setApiToken(token);
        setStatus(token ? "signedIn" : "signedOut");
      })
      .catch(() => setStatus("signedOut"));
  }, []);

  const signIn = useCallback(async (token: string) => {
    await tokenStore.save(token);
    setApiToken(token);
    setStatus("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    setApiToken(null);
    // The next person to sign in on this phone must not see the last one's data.
    queryClient.clear();
    setStatus("signedOut");
  }, [queryClient]);

  const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
