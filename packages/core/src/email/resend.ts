import type { Mailer } from "./types.ts";

/** Resend's HTTP API. Plain fetch, so no SDK dependency. */
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(message) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, ...message }),
      });
      // Status only: the response body can echo the recipient, which must not reach logs.
      if (!res.ok) throw new Error(`Resend rejected the email (HTTP ${res.status})`);
    },
  };
}
