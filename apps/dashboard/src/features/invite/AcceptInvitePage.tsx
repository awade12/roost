import { useNavigate } from "@tanstack/react-router";
import { Button, Logo } from "../../components/ui/index.ts";
import { useMe, useSignOut } from "../session/index.ts";
import { useAcceptInvite, useInvitePreview } from "./use-invite.ts";

/** /invite/$token: shown even to people with no studio yet, so a new teammate lands here, not on "Name your studio". */
export function AcceptInvitePage({ token }: { token: string }) {
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);
  const me = useMe().data;
  const signOut = useSignOut();
  const navigate = useNavigate();
  const wrongEmail = preview.data && me && preview.data.email !== me.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-5 text-center">
        <Logo height={28} className="text-fg" />
        {preview.isPending && <p className="text-muted">Checking your invite…</p>}
        {preview.isError && <p className="text-muted">{preview.error.message}. Ask for a new invite.</p>}
        {preview.data && (
          <>
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold tracking-tight">Join {preview.data.orgName}</h1>
              <p className="text-muted">
                You're invited as <span className="text-fg capitalize">{preview.data.role}</span>, for {preview.data.email}.
              </p>
            </div>
            {wrongEmail ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">You're signed in as {me.email}. Sign in with {preview.data.email} to accept.</p>
                <Button onClick={() => signOut.mutate()}>Sign out</Button>
              </div>
            ) : (
              <Button variant="primary" disabled={accept.isPending} onClick={() => accept.mutate(undefined, { onSuccess: () => void navigate({ to: "/" }) })}>
                {accept.isPending ? "Joining…" : `Join ${preview.data.orgName}`}
              </Button>
            )}
            {accept.error && <p className="text-xs text-danger">{accept.error.message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
