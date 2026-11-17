import { Outlet, useRouterState } from "@tanstack/react-router";
import { SessionGate } from "../features/session/index.ts";
import { CreateOrg, useCurrentOrg } from "../features/studio/index.ts";
import { Header } from "./Header.tsx";
import { Sidebar } from "./Sidebar.tsx";

function SignedIn() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const org = useCurrentOrg();
  // Accepting an invite is how a new teammate gets a studio, so it can't require one.
  if (pathname.startsWith("/invite/")) return <Outlet />;
  // A user with no org names their studio first; every other page needs one.
  if (!org) return <CreateOrg />;
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Signed-in frame: sidebar, header, and the current page. */
export function AppShell() {
  return (
    <SessionGate>
      <SignedIn />
    </SessionGate>
  );
}
