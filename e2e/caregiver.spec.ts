import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as db from "../lib/db";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("caregiver reviews and declines a pending request", async ({ page }) => {
  const h = await db.createHousehold(null);
  const s = await db.createSession(h.senior.id);
  await db.addMessage(s.id, "user", "I need a blood pressure monitor");
  const order = await db.createDraftOrder({
    userId: h.senior.id,
    sessionId: s.id,
    quantity: 1,
    product: { productId: "e2e-monitor", title: "Blood Pressure Monitor", priceCents: 6500, merchant: "walmart.com", url: "https://walmart.com", imageUrl: null, imageAlt: "monitor", rating: 4.4, category: "Health" },
  });
  await db.transitionOrder(order.id, "CONFIRMED", "test", {
    route: "caregiver",
    flags: [{ code: "S2_OVER_SELF_PAY_LIMIT", message: "This is more than your own spending limit." }],
    summary: "Rose wants a blood pressure monitor for $65.",
  });
  await db.transitionOrder(order.id, "AWAITING_CAREGIVER", "test");

  await page.goto(`/caregiver/requests/${order.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Blood Pressure Monitor");
  await expect(page.getByText("Rose wants a blood pressure monitor for $65.")).toBeVisible();
  await expect(page.getByText("I need a blood pressure monitor")).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);

  await page.getByLabel(/reason/i).fill("Let's buy it together on Sunday");
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText(/not approved by Anna/)).toBeVisible();
});

test("caregiver dashboard passes axe and saves limits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /try as anna/i }).click();
  await expect(page).toHaveURL(/\/caregiver/);
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await page.getByLabel(/can pay alone/i).fill("30");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Limits saved.")).toBeVisible();
  await expect(page.getByLabel(/can pay alone/i)).toHaveValue("30");
});
