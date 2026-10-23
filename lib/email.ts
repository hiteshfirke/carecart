import { Resend } from "resend";
import { formatUsd } from "@/lib/money";
import type { Order, User } from "@/lib/db";
import { merchantName } from "@/lib/orders/view";

export type EmailMessage = { to: string; subject: string; html: string };
export type SendEmail = (message: EmailMessage) => Promise<boolean>;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const sendEmail: SendEmail = async (message) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY is not set; email skipped");
    return false;
  }
  try {
    const { error } = await new Resend(key).emails.send({
      from: process.env.EMAIL_FROM ?? "CareCart <onboarding@resend.dev>",
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    if (error) {
      console.error("email failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("email failed", err);
    return false;
  }
};

function orderBlock(order: Order, senior: User): string {
  const flags = order.flags.length ? `<ul>${order.flags.map((f) => `<li>${escapeHtml(f.message)}</li>`).join("")}</ul>` : "";
  const summary = order.summary ? `<p><em>AI summary (may be inaccurate):</em> ${escapeHtml(order.summary)}</p>` : "";
  return `${orderSentence(order, senior)}
${flags}${summary}`;
}

function orderSentence(order: Order, senior: User): string {
  const amount = `<strong>$${formatUsd(order.totalCents)}</strong>`;
  if (order.kind === "gift") {
    const rel = order.payee?.relationship ? ` (${escapeHtml(order.payee.relationship)})` : "";
    return `<p>${escapeHtml(senior.name)} asked to send ${amount} to <strong>${escapeHtml(order.payee?.name ?? order.merchant)}</strong>${rel}.</p>`;
  }
  return `<p>${escapeHtml(senior.name)} asked to buy <strong>${escapeHtml(order.product.title)}</strong> for ${amount} from ${escapeHtml(merchantName(order.merchant))}.</p>`;
}

export function requestEmail(order: Order, senior: User, link: string) {
  return {
    subject:
      order.kind === "gift"
        ? `${senior.name} needs your OK to send $${formatUsd(order.totalCents)} to ${order.payee?.name ?? order.merchant}`
        : `${senior.name} needs your OK for a $${formatUsd(order.totalCents)} order`,
    html: `${orderBlock(order, senior)}<p><a href="${escapeHtml(link)}">Review it and approve or decline</a></p>`,
  };
}

export function scamAlertEmail(order: Order, senior: User, link: string) {
  return {
    subject: order.kind === "gift" ? `Scam warning: CareCart stopped money ${senior.name} was sending` : `Scam warning: CareCart stopped a purchase for ${senior.name}`,
    html: `<p><strong>We blocked this ${order.kind === "gift" ? "payment" : "order"} because it looks like a scam.</strong> Please check in with ${escapeHtml(senior.name)}.</p>${orderBlock(order, senior)}<p><a href="${escapeHtml(link)}">See what was stopped</a></p>`,
  };
}

export function reminderEmail(order: Order, senior: User, link: string) {
  return {
    subject: `Reminder: ${senior.name} is still waiting for your OK`,
    html: `${orderBlock(order, senior)}<p><a href="${escapeHtml(link)}">Review it and approve or decline</a></p>`,
  };
}

export function addPersonRequestEmail(senior: User, name: string, link: string) {
  return {
    subject: `${senior.name} wants to send money to ${name}`,
    html: `<p>${escapeHtml(senior.name)} asked to send money to <strong>${escapeHtml(name)}</strong>, who isn't on the list of trusted people yet.</p><p><a href="${escapeHtml(link)}">Add ${escapeHtml(name)}</a></p>`,
  };
}
