import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SESSION = "22222222-2222-4222-8222-222222222222";
const ORDER = "11111111-1111-4111-8111-111111111111";
const options = [
  { title: "Lipton Green Tea, 100 bags", priceCents: 849, priceWords: "eight dollars and forty-nine cents", merchant: "Target", imageUrl: null, imageAlt: "tea", rating: 4.6 },
  { title: "Bigelow Green Tea, 40 bags", priceCents: 599, priceWords: "five dollars and ninety-nine cents", merchant: "Walmart", imageUrl: null, imageAlt: "tea", rating: 4.7 },
  { title: "Twinings Green Tea, 20 bags", priceCents: 449, priceWords: "four dollars and forty-nine cents", merchant: "Walmart", imageUrl: null, imageAlt: "tea", rating: 4.5 },
];
const draft = {
  id: ORDER, title: "Lipton Green Tea, 100 bags", imageUrl: null, imageAlt: "tea", quantity: 1, totalCents: 849,
  totalWords: "eight dollars and forty-nine cents", merchant: "Target", status: "DRAFT", statusWords: "not confirmed yet",
  flags: [], tracking: null, declineReason: null, payerRole: null, summary: null,
  readBack: 'You\'re buying Lipton Green Tea, 100 bags, for eight dollars and forty-nine cents in total, from Target. Say "confirm" or press Confirm to continue, or say "cancel".',
};

async function mockAgent(page: Page) {
  await page.route("**/api/agent", async (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    if (/option 1/i.test(text)) {
      return route.fulfill({ json: { sessionId: SESSION, reply: "Let me read that back to you.", options: null, draft } });
    }
    return route.fulfill({ json: { sessionId: SESSION, reply: "Option one: Lipton Green Tea, eight dollars and forty-nine cents, from Target. Which one would you like?", options, draft: null } });
  });
}

async function startAsRose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /try as rose/i }).click();
  await expect(page).toHaveURL(/\/talk/);
  // Typing before React hydrates submits the form natively and reloads /talk; wait for React's handlers on the input.
  await page.waitForFunction(() => {
    const input = document.getElementById("typed");
    return !!input && Object.keys(input).some((k) => k.startsWith("__reactProps"));
  });
}

test("home page passes axe", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /try as rose/i })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("keyboard-only order flow reaches the caregiver path", async ({ page }) => {
  await mockAgent(page);
  await page.route(`**/api/orders/${ORDER}/confirm`, (route) => route.fulfill({ json: { outcome: "caregiver", caregiverName: "Anna", emailed: true } }));
  await page.route(`**/api/orders/${ORDER}`, (route) => route.fulfill({ json: { ...draft, status: "AWAITING_CAREGIVER", statusWords: "waiting for Anna to approve" } }));
  await startAsRose(page);

  await page.getByLabel("Or type what you need").fill("I need green tea");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /pick one/i })).toBeFocused();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations).toEqual([]);

  await page.keyboard.press("1");
  await expect(page.getByRole("heading", { name: /check your order/i })).toBeFocused();
  await expect(page.getByText("Total: $8.49")).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("needs Anna's OK");
});

test("ambiguous speech at the confirm step does not pay", async ({ page }) => {
  await mockAgent(page);
  let confirmCalls = 0;
  await page.route(`**/api/orders/${ORDER}/confirm`, (route) => {
    confirmCalls++;
    return route.fulfill({ json: { outcome: "pay", approveUrl: "about:blank" } });
  });
  await startAsRose(page);
  const box = page.getByLabel("Or type what you need");
  await box.fill("I need green tea");
  await box.press("Enter");
  await box.fill("the first one");
  await box.press("Enter");
  await expect(page.getByRole("heading", { name: /check your order/i })).toBeVisible();
  await box.fill("yes but wait");
  await box.press("Enter");
  await expect(page.getByText("yes but wait")).toBeVisible();
  expect(confirmCalls).toBe(0);
});

test("screen-reader mode shows a focused Continue to PayPal link instead of navigating away", async ({ page }) => {
  await mockAgent(page);
  await page.route(`**/api/orders/${ORDER}/confirm`, (route) => route.fulfill({ json: { outcome: "pay", approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PP1" } }));
  await startAsRose(page);
  await page.getByRole("button", { name: "Screen reader mode" }).click();
  const box = page.getByLabel("Or type what you need");
  await box.fill("I need green tea");
  await box.press("Enter");
  await box.fill("option 1");
  await box.press("Enter");
  await page.getByRole("button", { name: /confirm/i }).click();
  await expect(page.getByRole("link", { name: "Continue to PayPal" })).toBeFocused();
  await expect(page).toHaveURL(/\/talk/);
});

test("text size buttons' accessible names include their visible text", async ({ page }) => {
  await startAsRose(page);
  await expect(page.getByRole("button", { name: "A− smaller text" })).toBeVisible();
  await expect(page.getByRole("button", { name: "A+ bigger text" })).toBeVisible();
});

test("an unknown PayPal return still explains what happened", async ({ page }) => {
  await page.goto("/?payment=unknown");
  await expect(page.getByRole("status")).toContainText("couldn't check the payment");
});

test("returning from PayPal shows the result as text with a Tap to hear button", async ({ page }) => {
  await page.route(`**/api/orders/${ORDER}`, (route) => route.fulfill({ json: { ...draft, status: "PAID", statusWords: "paid", payerRole: "senior" } }));
  await startAsRose(page);
  await page.goto(`/talk?order=${ORDER}&payment=paid`);
  await expect(page.getByText("Paid eight dollars and forty-nine cents for Lipton Green Tea, 100 bags. It's on the way.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Tap to hear" })).toBeVisible();
});

// A stand-in for Chrome's speech recognition: hears the given phrases with a pause between them.
async function fakeRecognition(page: Page, phrases: string[]) {
  await page.addInitScript((said: string[]) => {
    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      start() {
        said.forEach((_, i) => {
          const results = said.slice(0, i + 1).map((t) => [{ transcript: t }]);
          setTimeout(() => this.onresult?.({ results }), 200 + i * 900);
        });
        if (said.length === 0) setTimeout(() => this.onend?.(), 300);
      }
      stop() {
        setTimeout(() => this.onend?.(), 10);
      }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  }, phrases);
}

test("a pause mid-sentence does not cut off what Rose says", async ({ page }) => {
  const sent: string[] = [];
  await page.route("**/api/agent", (route) => {
    sent.push((route.request().postDataJSON() as { text: string }).text);
    return route.fulfill({ json: { sessionId: SESSION, reply: "Okay.", options: null, draft: null } });
  });
  await fakeRecognition(page, ["I am looking for", "reading glasses"]);
  await startAsRose(page);
  await page.getByRole("button", { name: /tap to talk/i }).click();
  await expect(page.getByText("Heard: “I am looking for”")).toBeVisible();
  await expect(page.getByText("You: I am looking for reading glasses")).toBeVisible({ timeout: 8000 });
  expect(sent).toEqual(["I am looking for reading glasses"]);
});

test("Rose is told when nothing was heard", async ({ page }) => {
  await fakeRecognition(page, []);
  await startAsRose(page);
  await page.getByRole("button", { name: /tap to talk/i }).click();
  await expect(page.getByRole("status").filter({ hasText: "I didn't hear anything" })).toBeVisible();
});
