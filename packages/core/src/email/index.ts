import { resendMailer } from "./resend.ts";
import { smtpMailer } from "./smtp.ts";
import type { Mailer, MailerConfig } from "./types.ts";

export { otpEmail } from "./otp-email.ts";
export type { EmailMessage, Mailer, MailerConfig } from "./types.ts";

export function createMailer(config: MailerConfig): Mailer {
  return config.provider === "smtp"
    ? smtpMailer(config.smtpUrl, config.from)
    : resendMailer(config.apiKey, config.from);
}
