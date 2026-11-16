import type { ReactNode } from "react";
import { useMe } from "../api/use-me.ts";
import { SignIn } from "./SignIn.tsx";

/** Renders children only for a signed-in user; otherwise the sign-in screen. */
export function SessionGate({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>;
  }
  if (me.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-1 text-center">
        <p className="font-medium">Can't reach the Roost API</p>
        <p className="text-muted">Check that it's running, then reload.</p>
      </div>
    );
  }
  if (me.data === null) return <SignIn />;
  return <>{children}</>;
}
