import { useRouterState } from "@tanstack/react-router";
import { useEnvironment } from "../features/studio/index.ts";
import { ALL_NAV } from "./nav.ts";

/** Breadcrumb bar: game / current page. The game and environment are picked in the sidebar. */
export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { selected } = useEnvironment();
  // Exact match, or the section a nested page belongs to (e.g. /issues/123 → Issues).
  const page =
    ALL_NAV.find(
      (item) => item.to === pathname || (item.to !== "/" && pathname.startsWith(`${item.to}/`)),
    )?.label ?? "";
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-8">
      {selected && (
        <>
          <span className="text-muted">{selected.game.name}</span>
          <span className="text-faint">/</span>
        </>
      )}
      <span className="font-medium">{page}</span>
    </header>
  );
}
