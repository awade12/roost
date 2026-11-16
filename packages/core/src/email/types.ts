export type EmailMessage = { to: string; subject: string; text: string; html: string };

/** Anything that can deliver an email. Tests pass an in-memory one. */
export type Mailer = { send(message: EmailMessage): Promise<void> };

export type MailerConfig =
  | { provider: "smtp"; smtpUrl: string; from: string }
  | { provider: "resend"; apiKey: string; from: string };
