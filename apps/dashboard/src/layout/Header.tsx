import { useRouterState } from "@tanstack/react-router";
import { useMe } from "../features/session/index.ts";
import { EnvironmentPicker } from "../features/studio/index.ts";
import { ALL_NAV } from "./nav.ts";

/** Breadcrumb bar: org / current page. */
export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = useMe();
  // Exact match, or the section a nested page belongs to (e.g. /issues/123 → Issues).
  const page = ALL_NAV.find((item) => item.to === pathname || (item.to !== "/" && pathname.startsWith(`${item.to}/`)))?.label ?? "";
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-8">
      <span className="text-muted">{me.data?.orgs[0]?.name ?? "No org yet"}</span>
      <span className="text-faint">/</span>
      <span className="font-medium">{page}</span>
      <div className="ml-auto">
        <EnvironmentPicker />
      </div>
    </header>
  );
}
