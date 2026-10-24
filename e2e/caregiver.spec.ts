import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { neon } from "@neondatabase/serverless";
import * as db from "../lib/db";
import { caregiverLink, newCaregiverToken } from "../lib/caregiver";
import { trustedRequestLink } from "../lib/gifts";

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
    caregiverToken: newCaregiverToken(),
  });
  const moved = await db.transitionOrder(order.id, "AWAITING_CAREGIVER", "test");
  expect(moved?.result).toBe("applied");

  // Anna arrives from her email link, so she has the token but not Rose's household cookie.
  await page.goto(caregiverLink("", moved!.order));
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

test("Anna adds and removes trusted people, and the page passes axe", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /try as anna/i }).click();
  await expect(page).toHaveURL(/\/caregiver/);
  const people = page.getByRole("region", { name: "People Rose can send money to" });
  await expect(people.getByRole("listitem")).toHaveCount(1);
  await expect(people.getByRole("listitem")).toContainText("Sam");

  const add = async (name: string, relationship: string, email: string) => {
    await people.getByLabel("Name", { exact: true }).fill(name);
    await people.getByLabel(/relationship/i).fill(relationship);
    await people.getByLabel(/paypal email/i).fill(email);
    await people.getByRole("button", { name: "Add to the list" }).click();
  };
  await add("Ben", "neighbor", "ben@example.com");
  await expect(page.getByText("Added to the list.")).toBeVisible();
  await expect(people.getByRole("listitem")).toHaveCount(2);
  await expect(people.getByRole("listitem").filter({ hasText: "Ben" })).toContainText("neighbor");
  await expect(people.getByRole("listitem").filter({ hasText: "Ben" })).toContainText("ben@example.com");

  await add("ben", "", "other@example.com");
  await expect(page.getByText("That name is already on the list.")).toBeVisible();
  await expect(people.getByRole("listitem")).toHaveCount(2);

  // The browser stops a bad email before it is sent, so the server check is exercised with a direct post.
  const bad = await page.request.post("/api/caregiver/people", { form: { name: "Zed", paypalEmail: "not-an-email" }, maxRedirects: 0 });
  expect(bad.status()).toBe(303);
  await page.goto(bad.headers().location);
  await expect(page.getByText(/valid PayPal email/)).toBeVisible();
  await expect(people.getByRole("listitem")).toHaveCount(2);

  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);

  const remove = people.getByRole("button", { name: "Remove Ben" });
  expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await remove.click();
  await expect(page.getByText("Removed from the list.")).toBeVisible();
  await expect(people.getByRole("listitem")).toHaveCount(1);
  await expect(people.getByRole("listitem")).toContainText("Sam");
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

test("the people routes need Rose's household cookie", async ({ request }) => {
  const add = await request.post("/api/caregiver/people", { form: { name: "Eve", paypalEmail: "eve@example.com" }, maxRedirects: 0 });
  expect(add.status()).toBe(303);
  expect(new URL(add.headers().location).pathname).toBe("/");
  const remove = await request.post("/api/caregiver/people/some-id/remove", { maxRedirects: 0 });
  expect(remove.status()).toBe(303);
  expect(new URL(remove.headers().location).pathname).toBe("/");
});

test("the add-request link adds one person, once, without Rose's cookie", async ({ page }) => {
  const h = await db.createHousehold(null);
  const { request } = await db.openTrustedRequest(h.id, "Tom", newCaregiverToken());
  const link = trustedRequestLink("", request);

  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tom");
  // The name is fixed by the request: only the relationship and the email can be typed.
  await expect(page.getByRole("textbox")).toHaveCount(2);
  await expect(page.getByLabel(/name/i)).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);

  // The browser stops a bad email before it is sent, so the server check is exercised with a direct post.
  const bad = await page.request.post("/api/caregiver/people/requests", { form: { r: request.id, t: request.token, paypalEmail: "not-an-email" }, maxRedirects: 0 });
  expect(bad.status()).toBe(303);
  await page.goto(bad.headers().location);
  await expect(page.getByText(/valid PayPal email/)).toBeVisible();
  expect(await db.listTrustedPeople(h.id)).toHaveLength(1);

  await page.getByLabel(/relationship/i).fill("nephew");
  await page.getByLabel(/paypal email/i).fill("tom@example.com");
  await page.getByRole("button", { name: "Add Tom" }).click();
  await expect(page.getByText("Tom is on Rose's list now.")).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  expect((await db.listTrustedPeople(h.id)).find((p) => p.name === "Tom")).toMatchObject({ relationship: "nephew", paypalEmail: "tom@example.com" });

  await page.goto(link);
  await expect(page.getByText("This person has already been added.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);

  await page.goto(link.replace(/t=[^&]+/, "t=wrong-token"));
  await expect(page.getByText("This link has expired.")).toBeVisible();
  await expect(page.getByText("Tom")).toHaveCount(0);
});

test("a link for a name that is already on the list says so, and an old link says it expired", async ({ page }) => {
  const h = await db.createHousehold(null);
  // Sam is already trusted. The link is for the same name written another way.
  const { request } = await db.openTrustedRequest(h.id, "sam", newCaregiverToken());
  await page.goto(trustedRequestLink("", request));
  await page.getByLabel(/paypal email/i).fill("other-sam@example.com");
  await page.getByRole("button", { name: "Add sam" }).click();
  await expect(page.getByText("That name is already on the list.")).toBeVisible();
  await expect(page.getByText("This person has already been added.")).toHaveCount(0);
  const people = await db.listTrustedPeople(h.id);
  expect(people).toHaveLength(1);
  expect(people[0].paypalEmail).not.toBe("other-sam@example.com");

  const gone = await db.openTrustedRequest(h.id, "Old", newCaregiverToken());
  await neon(process.env.DATABASE_URL as string)`update trusted_requests set expires_at = now() - interval '1 minute' where id = ${gone.request.id}`;
  await page.goto(trustedRequestLink("", gone.request));
  await expect(page.getByText("This link has expired.")).toBeVisible();
});

test("a gift request says Rose will send it herself", async ({ page }) => {
  const h = await db.createHousehold(null);
  const s = await db.createSession(h.senior.id);
  const sam = (await db.listTrustedPeople(h.id))[0];
  const order = await db.createDraftGift({
    userId: h.senior.id,
    sessionId: s.id,
    payee: { trustedPersonId: sam.id, name: sam.name, relationship: sam.relationship, paypalEmail: sam.paypalEmail },
    amountCents: 2000,
    note: null,
  });
  await db.transitionOrder(order.id, "CONFIRMED", "test", { route: "caregiver", summary: "Rose wants to send $20.00 to Sam.", caregiverToken: newCaregiverToken() });
  const moved = await db.transitionOrder(order.id, "AWAITING_CAREGIVER", "test");
  expect(moved?.result).toBe("applied");
  const link = caregiverLink("", moved!.order);
  const APPROVED = "Approved. Rose will hear the news and send it herself.";

  // On Anna's dashboard the waiting gift reads as who gets the money.
  await page.context().addCookies([{ name: "cc_household", value: h.id, domain: "localhost", path: "/" }]);
  await page.goto("/caregiver");
  await expect(page.getByRole("region", { name: /waiting for you/i })).toContainText("Send $20.00 to Sam");
  await page.context().clearCookies();

  // A crafted link cannot claim an approval that did not happen.
  await page.goto(`${link}&approved=1`);
  await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
  // Money goes to Sam, so the request page says who gets it, not who it is "from".
  await expect(page.getByText("To Sam. Status: waiting for Anna to approve.")).toBeVisible();
  await expect(page.getByText(/^From /)).toHaveCount(0);
  await expect(page.getByText(APPROVED)).toHaveCount(0);

  await page.getByRole("button", { name: /approve/i }).click();
  await expect(page.getByText(APPROVED)).toBeVisible();
  await expect(page.getByText(/approved, waiting for Rose to send it/)).toBeVisible();
  await expect(page.getByText(/waiting for you/)).toHaveCount(0);
  const after = await db.getOrder(order.id);
  expect(after).toMatchObject({ status: "AWAITING_PAYMENT", payerRole: "senior" });
});
