import { useState, type FormEvent } from "react";
import { Button, Card, CardHeader, Textarea } from "../../../../components/ui/index.ts";
import { formatAgo } from "../../../../lib/format.ts";
import { useMe } from "../../../session/index.ts";
import { useActivity, useComment, type Activity as Entry } from "../../api/use-issue-collab.ts";

/** One line for each non-comment change. */
function describe(a: Entry): string {
  const d = (a.data ?? {}) as Record<string, string | null | undefined>;
  switch (a.kind) {
    case "status":
      return d.reason === "regression" ? `Regressed in ${d.build ?? "a new build"} and reopened` : `changed status from ${d.from} to ${d.to}`;
    case "assigned":
      return d.to ? "assigned the issue" : "unassigned the issue";
    case "labeled":
      return `added label ${d.label}`;
    case "unlabeled":
      return `removed label ${d.label}`;
    case "linear":
      return `sent to Linear as ${d.identifier}`;
    default:
      return "";
  }
}

function Comment({ entry, mine, onDelete }: { entry: Entry; mine: boolean; onDelete: () => void }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">{entry.userEmail ?? "Someone"}</span>
        <span className="text-muted">{formatAgo(entry.createdAt)}</span>
        {mine && (
          <button className="ml-auto text-muted hover:text-danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
      <p className="text-[13px] leading-5 whitespace-pre-wrap">{entry.body}</p>
    </li>
  );
}

/** Timeline of comments and changes, with a box to comment. */
export function Activity({ issueId }: { issueId: string }) {
  const activity = useActivity(issueId);
  const { add, remove } = useComment(issueId);
  const myId = useMe().data?.id;
  const [body, setBody] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(body.trim(), { onSuccess: () => setBody("") });
  };
  return (
    <Card>
      <CardHeader title="Activity" />
      <ol className="flex flex-col gap-2 p-4">
        {activity.data?.length === 0 && <li className="text-xs text-muted">No activity yet.</li>}
        {activity.data?.map((a) =>
          a.kind === "comment" ? (
            <Comment key={a.id} entry={a} mine={a.userId === myId} onDelete={() => remove.mutate(a.id)} />
          ) : (
            <li key={a.id} className="flex items-center gap-2 px-1 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-faint" />
              <span className="text-fg">{a.userEmail ?? "Roost"}</span> {describe(a)} · {formatAgo(a.createdAt)}
            </li>
          ),
        )}
      </ol>
      <form onSubmit={submit} className="flex flex-col gap-2 border-t border-border p-4">
        <Textarea placeholder="Leave a comment… (repro steps, a suspect commit, who's on it)" maxLength={10_000} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex items-center justify-end gap-3">
          {add.error && <span className="text-xs text-danger">{add.error.message}</span>}
          <Button variant="primary" disabled={add.isPending || !body.trim()}>
            Comment
          </Button>
        </div>
      </form>
    </Card>
  );
}
