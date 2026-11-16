import { createTransport } from "nodemailer";
import type { Mailer } from "./types.ts";

/** Any SMTP server. In dev this is Mailpit (http://localhost:8025 shows the inbox). */
export function smtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = createTransport(smtpUrl);
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}
