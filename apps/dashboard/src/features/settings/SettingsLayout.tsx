import { Link, Outlet } from "@tanstack/react-router";

const TABS = [
  { to: "/settings", label: "Studio", exact: true },
  { to: "/settings/members", label: "Members", exact: false },
  { to: "/settings/games", label: "Games & keys", exact: false },
  { to: "/settings/integrations", label: "Integrations", exact: false },
] as const;

/** Settings shell: one heading, tabs, and the selected page below. */
export function SettingsLayout() {
  return (
    <div className="flex max-w-4xl flex-col gap-5 px-8 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-muted">Studio, people, games and connections. Server-wide values (email, sign-up allowlist) live in the server's environment.</p>
      </div>
      <nav className="flex gap-1 border-b border-border" aria-label="Settings">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: tab.exact }}
            className="-mb-px border-b-2 border-transparent px-3 pb-2 text-muted hover:text-fg"
            activeProps={{ className: "!border-fg !text-fg font-medium" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
