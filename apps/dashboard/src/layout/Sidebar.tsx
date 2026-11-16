import { Link } from "@tanstack/react-router";
import { SignOutIcon } from "../components/icons/nav-icons.tsx";
import { Logo } from "../components/ui/index.ts";
import { useMe, useSignOut } from "../features/session/index.ts";
import { ANALYTICS_NAV, OPERATE_NAV, SETTINGS_NAV, type NavItem } from "./nav.ts";

function NavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/", includeSearch: false }}
      className="flex h-7 items-center gap-2 rounded-md px-2 text-muted transition-colors hover:bg-hover hover:text-fg"
      activeProps={{ className: "bg-hover !text-fg font-medium" }}
    >
      <Icon />
      <span>{item.label}</span>
    </Link>
  );
}

function Account() {
  const me = useMe();
  const signOut = useSignOut();
  const email = me.data?.email ?? "";
  return (
    <div className="flex items-center gap-2 border-t border-border px-2 pt-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-medium uppercase">
        {email.charAt(0)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{email}</span>
      <button
        className="rounded p-1 text-muted hover:bg-hover hover:text-fg disabled:opacity-50"
        title="Sign out"
        aria-label="Sign out"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        <SignOutIcon />
      </button>
    </div>
  );
}

export function Sidebar() {
  const me = useMe();
  const org = me.data?.orgs[0];
  return (
    <aside className="flex w-58 shrink-0 flex-col gap-4 border-r border-border bg-panel px-2.5 py-3">
      <div className="flex flex-col gap-1 px-2 py-1.5">
        <Logo height={18} className="text-fg" />
        {org && <span className="truncate text-xs text-muted">{org.name}</span>}
      </div>
      <nav className="flex flex-col gap-px">
        {ANALYTICS_NAV.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
      </nav>
      <nav className="flex flex-1 flex-col gap-px">
        <span className="px-2 pb-1.5 text-xs font-medium text-muted">Operate</span>
        {OPERATE_NAV.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
      </nav>
      <nav className="flex flex-col gap-px">
        {SETTINGS_NAV.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
      </nav>
      <Account />
    </aside>
  );
}
