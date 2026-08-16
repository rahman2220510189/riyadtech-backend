import { Resend } from "resend";
import { env } from "../env.js";

/**
 * Notification email.
 *
 * Every call here is fire-and-forget and every failure is swallowed. A lead
 * that reached the database is a lead we have; if the email fails, the right
 * outcome is a log line, not a 500 for someone who just filled in a form.
 *
 * Without RESEND_API_KEY the whole thing is a no-op, so the site works before
 * any of this is configured.
 */

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export const emailConfigured = Boolean(resend && env.NOTIFY_EMAIL);

type Notice = {
  subject: string;
  /** Label / value pairs, printed in order */
  rows: [string, string][];
  /** The free text they wrote, if any */
  body?: string | null;
  /** Where to go to act on it */
  action?: string;
};

export function notify(notice: Notice): void {
  if (!resend || !env.NOTIFY_EMAIL) {
    console.info(`[email] not configured — would have sent: ${notice.subject}`);
    return;
  }

  const lines = notice.rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6E7A77;font:12px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;vertical-align:top">${escape(label)}</td><td style="padding:4px 0;color:#131A19">${escape(value)}</td></tr>`,
    )
    .join("");

  const html = `
<div style="font:15px/1.6 -apple-system,system-ui,sans-serif;color:#131A19;background:#F4F5F0;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#FBFBF8;border:1px solid #DCE0D8;border-radius:4px;padding:28px">
    <p style="margin:0 0 18px;font:12px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6E7A77">Riyad Tech</p>
    <h1 style="margin:0 0 22px;font-size:20px;line-height:1.25">${escape(notice.subject)}</h1>
    <table style="border-collapse:collapse;width:100%">${lines}</table>
    ${
      notice.body
        ? `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #DCE0D8;white-space:pre-wrap">${escape(notice.body)}</div>`
        : ""
    }
    ${
      notice.action
        ? `<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #DCE0D8"><a href="${escape(notice.action)}" style="color:#1F4D45">Open in the admin panel →</a></p>`
        : ""
    }
  </div>
</div>`;

  /* Deliberately not awaited. The caller has already answered the visitor. */
  resend.emails
    .send({
      from: env.FROM_EMAIL,
      to: env.NOTIFY_EMAIL,
      subject: notice.subject,
      html,
      /* Replies go to whoever wrote in, not to a no-reply void. */
      replyTo: notice.rows.find(([label]) => label === "Email")?.[1],
    })
    .then((result) => {
      if (result.error) console.warn("[email] rejected:", result.error);
    })
    .catch((error) => console.warn("[email] failed:", error));
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}