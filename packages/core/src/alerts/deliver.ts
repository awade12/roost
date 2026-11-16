import type { Mailer } from "../email/index.ts";
import type { Channel, EmailRecipients } from "./channels.ts";

export type AlertMessage = {
  trigger: "new_issue" | "regression" | "spike" | "test";
  /** "New crash in Sky Forge · production" */
  title: string;
  /** "#12 SaveCorrupt: save slot 2 failed to load" */
  summary: string;
  url: string | null;
  details: { label: string; value: string }[];
  /** Full payload for generic webhooks, so they can route on any field. */
  data: Record<string, unknown>;
};

export type DeliverDeps = {
  fetch: typeof fetch;
  mailer: Mailer | null;
  /** Member emails for an email channel. Bound to the rule's org by the caller. */
  emails: (recipients: EmailRecipients) => Promise<string[]>;
};

const COLORS: Record<AlertMessage["trigger"], number> = { new_issue: 0x4f8ff7, regression: 0xf5a524, spike: 0xe5484d, test: 0x8b8d98 };
const TIMEOUT_MS = 10_000;

/** Sends to one channel. Returns null on success, or an error safe to store and show (no URLs). */
export async function deliver(channel: Channel, message: AlertMessage, deps: DeliverDeps): Promise<string | null> {
  try {
    if (channel.kind === "email") return await sendEmail(channel, message, deps);
    if (!channel.url) return "Channel has no URL";
    const res = await deps.fetch(channel.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyFor(channel.kind, message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? null : `${channel.kind} answered ${res.status}`;
  } catch (err) {
    return err instanceof Error && err.name === "TimeoutError" ? `${channel.kind} timed out` : `${channel.kind} could not be reached`;
  }
}

function bodyFor(kind: Channel["kind"], m: AlertMessage): unknown {
  const link = m.url ?? undefined;
  if (kind === "discord") {
    return {
      username: "Roost",
      embeds: [
        {
          title: m.title.slice(0, 256),
          description: m.summary.slice(0, 2000),
          url: link,
          color: COLORS[m.trigger],
          fields: m.details.slice(0, 10).map((d) => ({ name: d.label, value: d.value.slice(0, 1000) || "—", inline: true })),
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
  if (kind === "slack") {
    const heading = link ? `*<${link}|${escapeSlack(m.title)}>*` : `*${escapeSlack(m.title)}*`;
    return {
      text: `${m.title}: ${m.summary}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `${heading}\n${escapeSlack(m.summary)}` } },
        ...(m.details.length
          ? [{ type: "context", elements: [{ type: "mrkdwn", text: m.details.map((d) => `${d.label}: ${escapeSlack(d.value)}`).join("  ·  ") }] }]
          : []),
      ],
    };
  }
  return { type: "roost.alert", trigger: m.trigger, title: m.title, summary: m.summary, url: m.url, ...m.data };
}

const escapeSlack = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeHtml = (s: string) => escapeSlack(s).replaceAll('"', "&quot;");

async function sendEmail(channel: Channel, m: AlertMessage, deps: DeliverDeps): Promise<string | null> {
  if (!deps.mailer) return "Email is not configured on this server";
  const to = await deps.emails(channel.recipients);
  if (to.length === 0) return "No one to email";
  const lines = [m.summary, "", ...m.details.map((d) => `${d.label}: ${d.value}`), ...(m.url ? ["", m.url] : [])];
  const html = [
    `<p><strong>${escapeHtml(m.summary)}</strong></p>`,
    ...m.details.map((d) => `<div>${escapeHtml(d.label)}: ${escapeHtml(d.value)}</div>`),
    m.url ? `<p><a href="${escapeHtml(m.url)}">Open in Roost</a></p>` : "",
  ].join("\n");
  for (const address of to) {
    await deps.mailer.send({ to: address, subject: `[Roost] ${m.title}`, text: lines.join("\n"), html });
  }
  return null;
}

export function testMessage(channelName: string, dashboardUrl: string | null): AlertMessage {
  return {
    trigger: "test",
    title: "Test alert from Roost",
    summary: `If you can read this, "${channelName}" is set up. Real alerts look like this, with the issue and a link.`,
    url: dashboardUrl,
    details: [{ label: "Channel", value: channelName }],
    data: { test: true },
  };
}
