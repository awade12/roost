import { Link } from "@tanstack/react-router";
import { SettingsIcon, SignOutIcon } from "../../components/icons/nav-icons.tsx";
import { useMe, useSignOut } from "../../features/session/index.ts";

const iconButton =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg disabled:opacity-50";

/** Who's signed in, with Settings and sign-out as icon buttons. */
export function SidebarFooter() {
  const me = useMe();
  const signOut = useSignOut();
  const email = me.data?.email ?? "";
  return (
    <div className="flex items-center gap-1 border-t border-border pt-2 pl-2">
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-border text-[11px] font-semibold uppercase">
        {email.charAt(0)}
      </span>
      <span className="min-w-0 flex-1 truncate pl-1.5 text-xs text-muted" title={email}>
        {email}
      </span>
      <Link
        to="/settings"
        title="Settings"
        aria-label="Settings"
        className={iconButton}
        activeProps={{ className: "bg-hover !text-fg" }}
      >
        <SettingsIcon />
      </Link>
      <button
        type="button"
        className={iconButton}
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
