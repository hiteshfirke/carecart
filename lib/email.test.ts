import { describe, expect, it } from "vitest";
import { addPersonRequestEmail, escapeHtml, requestEmail, scamAlertEmail } from "./email";
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
  it("labels the AI summary and lists the rule flags before it", () => {
    const html = requestEmail(order, senior, "https://app.test/x").html;
    expect(html).toContain("AI summary");
    expect(html.indexOf("more than your own spending limit")).toBeLessThan(html.indexOf("Rose wants a monitor."));
  });
  it("builds a scam alert", () => {
    expect(scamAlertEmail(order, senior, "https://app.test/caregiver").subject).toMatch(/scam/i);
  });
  describe("gifts", () => {
    const gift = {
      id: "o2",
      kind: "gift",
      product: { title: "Gift to <Sam>" },
      totalCents: 2000,
      merchant: "Sam",
      payee: { trustedPersonId: "t1", name: "Sam <b>", relationship: "grandson", paypalEmail: "sam@example.com" },
      summary: null,
      flags: [],
    } as unknown as Order;

    it("asks the caregiver to OK sending money", () => {
      const m = requestEmail(gift, senior, "https://app.test/x");
      expect(m.subject).toBe("Rose needs your OK to send $20.00 to Sam <b>");
      expect(m.html).toContain("Rose asked to send <strong>$20.00</strong> to <strong>Sam &lt;b&gt;</strong> (grandson).");
    });
    it("warns about a blocked gift", () => {
      expect(scamAlertEmail(gift, senior, "https://app.test/x").subject).toBe("Scam warning: CareCart stopped money Rose was sending");
    });
  });
  it("builds the add-person request with an escaped link", () => {
    const m = addPersonRequestEmail(senior, "Ben", 'https://app.test/add?t="x"&n=1');
    expect(m.subject).toBe("Rose wants to send money to Ben");
    expect(m.html).toContain('href="https://app.test/add?t=&quot;x&quot;&amp;n=1"');
    expect(m.html).toContain("Add Ben");
  });
});
