import { describe, expect, it } from "vitest";
import { escapeHtml, requestEmail, scamAlertEmail } from "./email";
import type { Order, User } from "./db";

const senior = { id: "rose", name: "Rose" } as User;
const order = {
  id: "o1",
  product: { title: "<b>Monitor</b>" },
  totalCents: 6500,
  merchant: "walmart.com",
  summary: "Rose wants a monitor.",
  flags: [{ code: "S2_OVER_SELF_PAY_LIMIT", message: "This is more than your own spending limit." }],
} as unknown as Order;

describe("email templates", () => {
  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
  it("builds the approval request with the price, summary, flags and link", () => {
    const m = requestEmail(order, senior, "https://app.test/caregiver/requests/o1");
    expect(m.subject).toContain("Rose needs your OK");
    expect(m.html).toContain("&lt;b&gt;Monitor&lt;/b&gt;");
    expect(m.html).toContain("$65.00");
    expect(m.html).toContain("Rose wants a monitor.");
    expect(m.html).toContain("more than your own spending limit");
    expect(m.html).toContain('href="https://app.test/caregiver/requests/o1"');
  });
  it("builds a scam alert", () => {
    expect(scamAlertEmail(order, senior, "https://app.test/caregiver").subject).toMatch(/scam/i);
  });
});
