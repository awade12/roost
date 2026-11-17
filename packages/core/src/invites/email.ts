import type { EmailMessage } from "../email/index.ts";

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function inviteEmail(to: string, studio: string, role: string, link: string): EmailMessage {
  return {
    to,
    subject: `You're invited to ${studio} on Roost`,
    text: `You've been invited to join ${studio} on Roost as ${role}.\n\nAccept: ${link}\n\nSign in with this email address (${to}). The link works for 7 days.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
<p>You've been invited to join <strong>${escape(studio)}</strong> on Roost as ${escape(role)}.</p>
<p style="margin:20px 0"><a href="${escape(link)}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Accept invite</a></p>
<p style="color:#666">Sign in with this email address (${escape(to)}). The link works for 7 days.</p>
</div>`,
  };
}
