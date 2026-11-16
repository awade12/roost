import { Link } from "@tanstack/react-router";
import type { NavItem } from "../nav.ts";

export type Counts = { issues: { new: number; regressed: number }; reports: { open: number } };

function Badge({ item, counts }: { item: NavItem; counts: Counts | undefined }) {
  if (!counts || !item.badge) return null;
  if (item.badge === "reports") {
    return counts.reports.open > 0 ? (
      <span className="font-mono text-[11px] text-muted">{counts.reports.open}</span>
    ) : null;
  }
  const { new: fresh, regressed } = counts.issues;
  return (
    <span className="flex items-center gap-1.5">
      {fresh > 0 && (
        <span className="font-mono text-[11px] text-muted" title={`${fresh} new this week`}>
          {fresh}
        </span>
      )}
      {regressed > 0 && (
        <span
          className="flex h-[18px] items-center rounded-full bg-warn/15 px-1.5 font-mono text-[11px] text-warn"
          title={`${regressed} regressed`}
        >
          {regressed}
        </span>
      )}
    </span>
  );
}

/** One sidebar row. Unbuilt sections stay visible but dimmed, with a "soon" tag. */
export function NavRow({ item, counts }: { item: NavItem; counts?: Counts | undefined }) {
  const Icon = item.icon;
  if (item.soon) {
    return (
      <Link
        to={item.to}
        className="flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] text-faint hover:text-muted"
      >
        <Icon />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="rounded border border-border px-1 text-[10px] leading-[14px]">soon</span>
      </Link>
    );
  }
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/", includeSearch: false }}
      className="flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
      // Quiet active state: a fill and a hairline, no accent bar.
      activeProps={{
        className: "bg-hover !text-fg font-medium shadow-[inset_0_0_0_1px_var(--color-border)]",
      }}
    >
      <Icon />
      <span className="flex-1 truncate">{item.label}</span>
      <Badge item={item} counts={counts} />
    </Link>
  );
}
