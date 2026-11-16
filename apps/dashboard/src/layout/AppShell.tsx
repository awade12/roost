import { Outlet } from "@tanstack/react-router";
import { SessionGate } from "../features/session/index.ts";
import { CreateOrg, useCurrentOrg } from "../features/studio/index.ts";
import { Header } from "./Header.tsx";
import { Sidebar } from "./Sidebar.tsx";

function SignedIn() {
  // A user with no org names their studio first; every other page needs one.
  if (!useCurrentOrg()) return <CreateOrg />;
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
