import { Logo } from "../components/ui/index.ts";
import { useNavCounts } from "../features/issues/index.ts";
import { useCurrentOrg, useEnvironment } from "../features/studio/index.ts";
import { ANALYTICS_NAV, OPERATE_NAV, type NavItem } from "./nav.ts";
import { GameSwitcher } from "./sidebar/GameSwitcher.tsx";
import { NavRow, type Counts } from "./sidebar/NavRow.tsx";
import { SidebarFooter } from "./sidebar/SidebarFooter.tsx";

function Section({
  title,
  items,
  counts,
  grow,
}: {
  title: string;
  items: NavItem[];
  counts: Counts | undefined;
  grow?: boolean;
}) {
  return (
    <nav
      aria-label={title}
      className={grow ? "flex flex-1 flex-col gap-px" : "flex flex-col gap-px"}
    >
      <span className="px-2 py-1.5 text-xs font-medium text-muted">{title}</span>
      {items.map((item) => (
        <NavRow key={item.to} item={item} counts={counts} />
      ))}
    </nav>
  );
}

export function Sidebar() {
  const org = useCurrentOrg();
  const { selected } = useEnvironment();
  const counts = useNavCounts(selected?.env.id).data;
  return (
    <aside className="flex w-58 shrink-0 flex-col gap-3 border-r border-border bg-panel px-2.5 pt-4 pb-2.5">
      <div className="flex h-6 items-center gap-2 px-2">
        <Logo height={18} className="shrink-0 text-fg" />
        <span className="text-[13px] text-faint">/</span>
        <span className="truncate text-xs text-muted">{org?.name}</span>
      </div>
      <GameSwitcher />
      <Section title="Analytics" items={ANALYTICS_NAV} counts={counts} />
      <Section title="Operate" items={OPERATE_NAV} counts={counts} grow />
      <SidebarFooter />
    </aside>
  );
}
