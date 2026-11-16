import type { EmailMessage } from "./types.ts";

export function otpEmail(to: string, code: string, ttlMinutes: number): EmailMessage {
  return {
    to,
    subject: `${code} is your Roost sign-in code`,
    text: `Your Roost sign-in code is ${code}\n\nIt expires in ${ttlMinutes} minutes. If you didn't ask for it, ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
<p>Your Roost sign-in code:</p>
<p style="font-size:32px;font-weight:600;letter-spacing:6px;margin:16px 0">${code}</p>
<p style="color:#666">It expires in ${ttlMinutes} minutes. If you didn't ask for it, ignore this email.</p>
</div>`,
  };
}
