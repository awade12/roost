import { Select } from "../../../../components/ui/index.ts";
import { useCurrentOrg, useMembers } from "../../../studio/index.ts";
import { useAssign } from "../../api/use-issue-collab.ts";

const NONE = "none";

export function AssigneeSelect({ issueId, assigneeId, disabled }: { issueId: string; assigneeId: string | null; disabled: boolean }) {
  const members = useMembers(useCurrentOrg()?.id);
  const assign = useAssign(issueId);
  const options = [{ value: NONE, label: "Unassigned" }, ...(members.data ?? []).map((m) => ({ value: m.id, label: m.email }))];
  return (
    <Select
      aria-label="Assignee"
      size="sm"
      disabled={disabled || assign.isPending}
      value={assigneeId ?? NONE}
      options={options}
      onChange={(v) => assign.mutate(v === NONE ? null : v)}
    />
  );
}
