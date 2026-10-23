import { beforeEach, describe, expect, it } from "vitest";
import { addTracking, buildOrderBody, capturePayPalOrder, createPayPalOrder, PayPalError, resetTokenCache, verifyWebhook } from "./paypal";
import { DEMO_ADDRESS } from "./db";

type Canned = { status?: number; body: unknown; headers?: Record<string, string> };
function fakeFetch(responses: Canned[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch to ${String(url)}`);
    const body = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return new Response(body, { status: next.status ?? 200, headers: next.headers });
  }) as typeof fetch;
  return { f, calls };
}
const TOKEN: Canned = { body: { access_token: "tok", expires_in: 3600 } };
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

beforeEach(() => {
  resetTokenCache();
  process.env.PAYPAL_CLIENT_ID = "cid";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
  process.env.PAYPAL_WEBHOOK_ID = "WH-1";
});

const input = {
  orderId: "ord-1",
  title: "Lipton Green Tea",
  unitCents: 1050,
  quantity: 2,
  shipTo: DEMO_ADDRESS,
  returnUrl: "http://localhost:3000/api/paypal/return",
  cancelUrl: "http://localhost:3000/api/paypal/cancel",
  requestId: "create-ord-1-senior",
};

describe("createPayPalOrder", () => {
  it("creates a CAPTURE order with items, address and PAY_NOW, and returns the payer-action link", async () => {
    const { f, calls } = fakeFetch([
      TOKEN,
      { body: { id: "PP1", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=PP1" }] } },
    ]);
    const result = await createPayPalOrder(input, f);

    expect(result).toEqual({ paypalOrderId: "PP1", approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PP1" });
    expect(calls[0].url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(calls[1].url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(header(calls[1].init, "PayPal-Request-Id")).toBe("create-ord-1-senior");
    const body = JSON.parse(calls[1].init.body as string);
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "21.00", breakdown: { item_total: { currency_code: "USD", value: "21.00" } } });
    expect(body.purchase_units[0].items[0]).toMatchObject({ quantity: "2", unit_amount: { currency_code: "USD", value: "10.50" } });
    expect(body.purchase_units[0].shipping.address).toEqual({ address_line_1: "1 Main St", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131", country_code: "US" });
    expect(body.payment_source.paypal.experience_context).toMatchObject({ shipping_preference: "SET_PROVIDED_ADDRESS", user_action: "PAY_NOW", return_url: input.returnUrl, cancel_url: input.cancelUrl });
  });

  it("reuses the access token across calls", async () => {
    const created = { body: { id: "PP1", links: [{ rel: "payer-action", href: "https://x" }] } };
    const { f, calls } = fakeFetch([TOKEN, created, created]);
    await createPayPalOrder(input, f);
    await createPayPalOrder(input, f);
    expect(calls.filter((c) => c.url.endsWith("/v1/oauth2/token"))).toHaveLength(1);
  });

  it("throws PayPalError with the debug id on failure", async () => {
    const { f } = fakeFetch([TOKEN, { status: 422, body: { name: "UNPROCESSABLE_ENTITY" }, headers: { "paypal-debug-id": "dbg1" } }]);
    const err = await createPayPalOrder(input, f).catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.status).toBe(422);
    expect(err.debugId).toBe("dbg1");
  });
});

describe("buildOrderBody", () => {
  it("builds a gift order that pays the recipient, with no shipping", () => {
    const body = buildOrderBody({ kind: "gift", orderId: "o9", title: "Gift to Sam", amountCents: 2000, payeeEmail: "sam@example.com", senderName: "Rose", returnUrl: "https://a/r", cancelUrl: "https://a/c", requestId: "x" });
    const unit = body.purchase_units[0];
    expect(unit.payee).toEqual({ email_address: "sam@example.com" });
    expect(unit.amount.value).toBe("20.00");
    expect(unit.items[0].category).toBe("DIGITAL_GOODS");
    expect(unit.description).toBe("Gift from Rose");
    expect("shipping" in unit).toBe(false);
    expect(body.payment_source.paypal.experience_context.shipping_preference).toBe("NO_SHIPPING");
  });

  it("leaves purchase orders unchanged", () => {
    const body = buildOrderBody(input);
    const unit = body.purchase_units[0];
    expect("payee" in unit).toBe(false);
    expect(unit.shipping?.name).toEqual({ full_name: DEMO_ADDRESS.fullName });
    expect(unit.items[0].category).toBe("PHYSICAL_GOODS");
    expect(body.payment_source.paypal.experience_context).toMatchObject({ brand_name: "CareCart Demo Store", shipping_preference: "SET_PROVIDED_ADDRESS" });
  });
});

describe("capturePayPalOrder", () => {
  it("captures with an idempotency key and returns the capture id", async () => {
    const { f, calls } = fakeFetch([
      TOKEN,
      { status: 201, body: { id: "PP1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] } }] } },
    ]);
    const r = await capturePayPalOrder("PP1", "capture-ord-1", f);
    expect(r).toEqual({ orderStatus: "COMPLETED", captureId: "CAP1", captureStatus: "COMPLETED" });
    expect(calls[1].url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/PP1/capture");
    expect(header(calls[1].init, "PayPal-Request-Id")).toBe("capture-ord-1");
  });

  it("reports the payee PayPal credited, so a gift can be checked", async () => {
    const { f } = fakeFetch([
      TOKEN,
      { status: 201, body: { id: "PP1", status: "COMPLETED", purchase_units: [{ payee: { email_address: "sam@example.com" }, payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] } }] } },
    ]);
    const r = await capturePayPalOrder("PP1", "capture-ord-1", f);
    expect(r.payeeEmail).toBe("sam@example.com");
  });
});

describe("addTracking", () => {
  it("posts the capture id, tracking number and carrier", async () => {
    const { f, calls } = fakeFetch([TOKEN, { status: 201, body: { id: "PP1" } }]);
    await addTracking("PP1", "CAP1", { carrier: "USPS", number: "9400100000000000000001" }, f);
    expect(calls[1].url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/PP1/track");
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ capture_id: "CAP1", tracking_number: "9400100000000000000001", carrier: "USPS", notify_payer: false });
  });
});

describe("verifyWebhook", () => {
  const headers = new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
    "paypal-transmission-id": "t1",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-10-20T10:00:00Z",
  });
  const rawBody = '{"id":"WH-EVT-1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"CAP1"}}';

  it("sends the raw event bytes and returns true on SUCCESS", async () => {
    const { f, calls } = fakeFetch([TOKEN, { body: { verification_status: "SUCCESS" } }]);
    expect(await verifyWebhook(headers, rawBody, f)).toBe(true);
    const sent = calls[1].init.body as string;
    expect(sent).toContain(`"webhook_event":${rawBody}`);
    expect(JSON.parse(sent)).toMatchObject({ auth_algo: "SHA256withRSA", transmission_id: "t1", webhook_id: "WH-1" });
  });

  it("returns false on FAILURE", async () => {
    const { f } = fakeFetch([TOKEN, { body: { verification_status: "FAILURE" } }]);
    expect(await verifyWebhook(headers, rawBody, f)).toBe(false);
  });

  it("returns false without calling PayPal when headers are missing", async () => {
    const { f, calls } = fakeFetch([]);
    expect(await verifyWebhook(new Headers(), rawBody, f)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
