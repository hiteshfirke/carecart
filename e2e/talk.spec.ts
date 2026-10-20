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

// Never call the real voice service from tests: by default the server voice is "off", so the browser voice is used.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/speech/**", (route) => route.fulfill({ status: 503, json: { error: "voice_off" } }));
});

// Counts audio plays and browser-voice utterances, finishing each one immediately.
async function spyOnSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __played: number; __synth: number };
    w.__played = 0;
    w.__synth = 0;
    HTMLMediaElement.prototype.play = function () {
      w.__played++;
      setTimeout(() => this.dispatchEvent(new Event("ended")), 20);
      return Promise.resolve();
    };
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
        w.__synth++;
        setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), 20);
      };
    }
  });
}
// A valid 0.1-second silent WAV, so the browser can load it like real speech audio.
function silentWav(): Buffer {
  const rate = 8000;
  const bytes = (rate / 10) * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(bytes, 40);
  return b;
}

const counts = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __played: number; __synth: number };
  return { played: w.__played, synth: w.__synth };
});

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

// Fakes a microphone and recorder (Chromium's headless microphone hangs): 0.8 s of speech from the moment
// listening starts, then silence. (Timing from page load made the test depend on how fast the page loaded.)
async function fakeRecorder(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, {
      MediaRecorder: class {
        mimeType = "audio/webm";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        start() {
          setTimeout(() => this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) }), 100);
        }
        stop() {
          setTimeout(() => this.onstop?.(), 10);
        }
      },
      AudioContext: class {
        createAnalyser() {
          const begun = Date.now();
          return {
            fftSize: 1024,
            getByteTimeDomainData(samples: Uint8Array) {
              const speaking = Date.now() - begun < 800;
              for (let i = 0; i < samples.length; i++) samples[i] = speaking ? (i % 2 ? 200 : 56) : 128;
            },
          };
        }
        createMediaStreamSource() {
          return { connect() {} };
        }
        close() {
          return Promise.resolve();
        }
      },
    });
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  });
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

test("replies use the natural server voice when it is available, in pieces of at most 200 characters", async ({ page }) => {
  const pieces: string[] = [];
  await page.route("**/api/speech/speak", (route) => {
    pieces.push((route.request().postDataJSON() as { text: string }).text);
    return route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() });
  });
  await spyOnSpeech(page);
  await startAsRose(page);
  await page.getByLabel("Or type what you need").fill("help");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await counts(page)).played).toBeGreaterThan(0);
  expect((await counts(page)).synth).toBe(0);
  expect(pieces.length).toBeGreaterThan(0);
  expect(pieces.every((p) => p.length <= 200)).toBe(true);
});

test("falls back to the browser voice when the server voice is off", async ({ page }) => {
  await spyOnSpeech(page);
  await startAsRose(page);
  await page.getByLabel("Or type what you need").fill("help");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await counts(page)).synth).toBeGreaterThan(0);
  expect((await counts(page)).played).toBe(0);
});

test("browsers without speech recognition record, stop after a pause, and send the audio to be transcribed", async ({ page }) => {
  await fakeRecorder(page);
  await page.addInitScript(() => Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined }));
  const sent: string[] = [];
  let uploads = 0;
  await page.route("**/api/speech/transcribe", (route) => {
    uploads++;
    return route.fulfill({ json: { text: "I need reading glasses" } });
  });
  await page.route("**/api/agent", (route) => {
    sent.push((route.request().postDataJSON() as { text: string }).text);
    return route.fulfill({ json: { sessionId: SESSION, reply: "Okay.", options: null, draft: null } });
  });
  await startAsRose(page);
  await page.getByRole("button", { name: /tap to talk/i }).click();
  await expect(page.getByRole("button", { name: /listening/i })).toBeVisible();
  await expect.poll(() => sent, { timeout: 10_000 }).toEqual(["I need reading glasses"]);
  expect(uploads).toBe(1);
});

test("with a demo running, the home page continues it and makes clear a fresh demo starts over", async ({ page }) => {
  await startAsRose(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue as Rose (shopper)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as Anna (caregiver)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a fresh demo (new Rose, no orders)" })).toBeVisible();
  await page.goto("/store");
  await page.getByRole("link", { name: "Back to Rose" }).click();
  await expect(page).toHaveURL(/\/talk$/);
});

test("Rose hears Anna's answer once, even if she changes the voice speed while waiting", async ({ page }) => {
  await mockAgent(page);
  await page.route(`**/api/orders/${ORDER}/confirm`, (route) => route.fulfill({ json: { outcome: "caregiver", caregiverName: "Anna", emailed: true } }));
  await page.route(`**/api/orders/${ORDER}`, (route) =>
    route.fulfill({ json: { ...draft, status: "AWAITING_PAYMENT", statusWords: "being paid by Anna", payerRole: "caregiver" } }),
  );
  await startAsRose(page);
  const box = page.getByLabel("Or type what you need");
  await box.fill("I need green tea");
  await box.press("Enter");
  await box.fill("option 1");
  await box.press("Enter");
  await expect(page.getByRole("heading", { name: /check your order/i })).toBeVisible();
  await box.fill("confirm");
  await box.press("Enter");
  const conversation = page.getByRole("region", { name: "Conversation" });
  const approved = conversation.getByText(/Anna approved your/);
  await expect(approved).toHaveCount(1, { timeout: 10_000 });
  await box.fill("slower");
  await box.press("Enter");
  await expect(conversation.getByText("Okay, I'll speak more slowly.")).toBeVisible();
  await page.waitForTimeout(6500); // more than one polling interval
  await expect(approved).toHaveCount(1);
});

test("interrupting speech cancels the request for the next piece", async ({ page }) => {
  const long =
    "Option one: Lipton Green Tea, one hundred bags, eight dollars and forty-nine cents, from Target. Option two: Bigelow Green Tea, forty bags, five dollars and ninety-nine cents, from Walmart. Option three: Twinings Green Tea, twenty bags, four dollars and forty-nine cents, from Walmart. Which one would you like?";
  await page.route("**/api/agent", (route) => route.fulfill({ json: { sessionId: SESSION, reply: long, options: null, draft: null } }));
  let pieces = 0;
  await page.route("**/api/speech/speak", async (route) => {
    pieces++;
    if (pieces > 1) await new Promise((r) => setTimeout(r, 3000)); // the next piece is slow to arrive
    await route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() }).catch(() => {});
  });
  const aborted: string[] = [];
  page.on("requestfailed", (req) => {
    if (req.url().includes("/api/speech/speak")) aborted.push(req.failure()?.errorText ?? "");
  });
  await spyOnSpeech(page);
  await fakeRecognition(page, []);
  await startAsRose(page);
  await page.getByLabel("Or type what you need").fill("hello");
  await page.keyboard.press("Enter");
  await expect.poll(() => pieces).toBeGreaterThan(1); // the second piece is being fetched
  await page.getByRole("button", { name: /tap to talk/i }).click(); // Rose interrupts
  await expect.poll(() => aborted.length).toBeGreaterThan(0);
});

test("an expired demo session sends Rose back to the home page", async ({ page }) => {
  await page.route("**/api/agent", (route) => route.fulfill({ status: 401, json: { error: "no_demo_session" } }));
  await startAsRose(page);
  await page.getByLabel("Or type what you need").fill("hello");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "CareCart" })).toBeVisible();
});

test("every page has a main menu that says who you are and gets you home in one tap", async ({ page }) => {
  await startAsRose(page);
  const menu = page.getByRole("navigation", { name: "Main" });
  await expect(menu.getByRole("link", { name: "Talk" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("You are Rose, the shopper")).toBeVisible();
  await menu.getByRole("link", { name: "Anna's page" }).click();
  await expect(page).toHaveURL(/\/caregiver$/);
  await expect(page.getByText("You are Anna, the caregiver")).toBeVisible();
  await menu.getByRole("link", { name: "Demo store" }).click();
  await expect(page.getByText("You are the shop (demo only)")).toBeVisible();
  await menu.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
});

test("the talk screen fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAgent(page);
  await startAsRose(page);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(await fits()).toBe(true);
  const box = page.getByLabel("Or type what you need");
  await box.fill("I need green tea");
  await box.press("Enter");
  await expect(page.getByRole("heading", { name: /pick one/i })).toBeVisible();
  expect(await fits()).toBe(true);
  await box.fill("option 1");
  await box.press("Enter");
  await expect(page.getByRole("heading", { name: /check your order/i })).toBeVisible();
  expect(await fits()).toBe(true);
});

test("'slower' makes the next reply noticeably slower", async ({ page }) => {
  await page.route("**/api/speech/speak", (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() }));
  await page.addInitScript(() => {
    const w = window as unknown as { __rates: number[] };
    w.__rates = [];
    HTMLMediaElement.prototype.play = function () {
      w.__rates.push(this.playbackRate);
      setTimeout(() => this.dispatchEvent(new Event("ended")), 20);
      return Promise.resolve();
    };
  });
  await startAsRose(page);
  const box = page.getByLabel("Or type what you need");
  const rates = () => page.evaluate(() => (window as unknown as { __rates: number[] }).__rates);
  await box.fill("help");
  await box.press("Enter");
  await expect.poll(async () => (await rates()).length).toBe(1);
  await box.fill("slower");
  await box.press("Enter");
  await expect.poll(async () => (await rates()).length).toBe(2);
  await box.fill("help");
  await box.press("Enter");
  await expect.poll(async () => (await rates()).length).toBe(3);
  const [before, confirmation, after] = await rates();
  expect(confirmation).toBeLessThanOrEqual(before - 0.15); // the confirmation itself is already slower
  expect(after).toBeLessThanOrEqual(before - 0.15);
});

test.describe("on a phone", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36" });

  test("listening records and transcribes instead of Android's repeating recognizer", async ({ page }) => {
    await fakeRecognition(page, ["I want", "I want a pair", "I want a pair of reading glasses"]);
    await fakeRecorder(page);
    const sent: string[] = [];
    await page.route("**/api/speech/transcribe", (route) => route.fulfill({ json: { text: "I want a pair of reading glasses" } }));
    await page.route("**/api/agent", (route) => {
      sent.push((route.request().postDataJSON() as { text: string }).text);
      return route.fulfill({ json: { sessionId: SESSION, reply: "Okay.", options: null, draft: null } });
    });
    await startAsRose(page);
    await page.getByRole("button", { name: /tap to talk/i }).click();
    await expect.poll(() => sent, { timeout: 10_000 }).toEqual(["I want a pair of reading glasses"]);
  });

  test("if the server can't transcribe, the next tap uses the phone's recognizer one phrase at a time", async ({ page }) => {
    await fakeRecorder(page);
    await page.addInitScript(() => {
      // Android's recognizer, recording whether it was asked for continuous mode.
      class PhoneRecognition {
        continuous = true;
        onresult: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        start() {
          (window as unknown as { __continuous: boolean }).__continuous = this.continuous;
          setTimeout(() => this.onresult?.({ results: [[{ transcript: "I want a pair of reading glasses" }]] }), 100);
          setTimeout(() => this.onend?.(), 300);
        }
        stop() {}
      }
      Object.assign(window, { SpeechRecognition: PhoneRecognition, webkitSpeechRecognition: PhoneRecognition });
    });
    await page.route("**/api/speech/transcribe", (route) => route.fulfill({ status: 503, json: { error: "voice_off" } }));
    const sent: string[] = [];
    await page.route("**/api/agent", (route) => {
      sent.push((route.request().postDataJSON() as { text: string }).text);
      return route.fulfill({ json: { sessionId: SESSION, reply: "Okay.", options: null, draft: null } });
    });
    await startAsRose(page);
    const talk = page.getByRole("button", { name: /tap to talk/i });
    await talk.click();
    await expect(page.getByText("I didn't hear anything")).toBeVisible({ timeout: 10_000 });
    await talk.click();
    await expect.poll(() => sent).toEqual(["I want a pair of reading glasses"]);
    expect(await page.evaluate(() => (window as unknown as { __continuous: boolean }).__continuous)).toBe(false);
  });

  test("the microphone level meter is created during the tap, before asking for the microphone (iPhone Safari)", async ({ page }) => {
    await fakeRecorder(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __order: string[]; AudioContext: new () => unknown };
      w.__order = [];
      const Ctx = w.AudioContext;
      w.AudioContext = class extends (Ctx as unknown as new () => object) {
        constructor() {
          super();
          w.__order.push("meter");
        }
      } as unknown as new () => unknown;
      const md = navigator.mediaDevices as unknown as { getUserMedia: () => Promise<unknown> };
      const gum = md.getUserMedia;
      md.getUserMedia = () => {
        w.__order.push("microphone");
        return gum();
      };
    });
    await page.route("**/api/speech/transcribe", (route) => route.fulfill({ json: { text: "hello" } }));
    await page.route("**/api/agent", (route) => route.fulfill({ json: { sessionId: SESSION, reply: "Okay.", options: null, draft: null } }));
    await startAsRose(page);
    await page.getByRole("button", { name: /tap to talk/i }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __order: string[] }).__order)).toEqual(["meter", "microphone"]);
  });
});

test("when a piece fails, the browser voice takes over and the prefetched piece is cancelled", async ({ page }) => {
  const long =
    "Option one: Lipton Green Tea, one hundred bags, eight dollars and forty-nine cents, from Target. Option two: Bigelow Green Tea, forty bags, five dollars and ninety-nine cents, from Walmart. Option three: Twinings Green Tea, twenty bags, four dollars and forty-nine cents, from Walmart. Which one would you like?";
  await page.route("**/api/agent", (route) => route.fulfill({ json: { sessionId: SESSION, reply: long, options: null, draft: null } }));
  let pieces = 0;
  await page.route("**/api/speech/speak", async (route) => {
    pieces++;
    if (pieces === 1) return route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() });
    if (pieces === 2) return route.fulfill({ status: 502, json: { error: "voice_failed" } });
    await new Promise((r) => setTimeout(r, 3000)); // piece 3, still on its way
    await route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() }).catch(() => {});
  });
  const aborted: string[] = [];
  page.on("requestfailed", (req) => {
    if (req.url().includes("/api/speech/speak")) aborted.push(req.failure()?.errorText ?? "");
  });
  await spyOnSpeech(page);
  await startAsRose(page);
  await page.getByLabel("Or type what you need").fill("hello");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await counts(page)).synth).toBeGreaterThan(0); // the browser voice took over
  await expect.poll(() => aborted.length).toBeGreaterThan(0);
});
