export type IssueGroup = "regressed" | "new" | "ongoing";

const DAY_MS = 86_400_000;

/** Regressed = came back after being resolved; New = first seen in the last day. */
export function groupOf(issue: { regressedAt: string | null; firstSeenAt: string }): IssueGroup {
  if (issue.regressedAt) return "regressed";
  return Date.now() - new Date(issue.firstSeenAt).getTime() < DAY_MS ? "new" : "ongoing";
}

export const GROUP_LABEL: Record<IssueGroup, string> = { regressed: "Regressed", new: "New", ongoing: "Ongoing" };

/** Icon + label always travel together, so status is never color alone. */
export function StatusIcon({ group }: { group: IssueGroup }) {
  if (group === "regressed") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="text-danger">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M7 7V3.5A3.5 3.5 0 0 1 10.5 7z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className={group === "new" ? "text-warn" : "text-muted"}>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeDasharray={group === "new" ? "2 2" : undefined} />
    </svg>
  );
}
