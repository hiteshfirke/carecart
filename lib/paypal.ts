import { formatUsd } from "@/lib/money";
import type { Address, Tracking } from "@/lib/db";

type Fetch = typeof fetch;
const base = () => process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(message: string, readonly status: number, readonly debugId: string | null, readonly body: unknown) {
    super(message);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;
export function resetTokenCache(): void {
  cachedToken = null;
}

async function accessToken(f: Fetch): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const res = await f(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError("PayPal auth failed", res.status, res.headers.get("paypal-debug-id"), await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call<T>(f: Fetch, path: string, body: string | undefined, requestId?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken(f)}`,
    "Content-Type": "application/json",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await f(`${base()}${path}`, { method: "POST", headers, body });
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalError(`PayPal POST ${path} failed`, res.status, res.headers.get("paypal-debug-id"), json);
  return json as T;
}

export type CreatePurchaseInput = {
  kind?: "purchase";
  orderId: string;
  title: string;
  unitCents: number;
  quantity: number;
  shipTo: Address;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
};

// A gift is a PayPal order whose money goes to a family member's PayPal account (payee), with nothing to ship.
export type CreateGiftInput = {
  kind: "gift";
  orderId: string;
  title: string;
  amountCents: number;
  payeeEmail: string;
  senderName: string;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
};

export type CreatePayPalOrderInput = CreatePurchaseInput | CreateGiftInput;

type UsdAmount = { currency_code: "USD"; value: string };

type OrderBody = {
  intent: "CAPTURE";
  purchase_units: {
    reference_id: string;
    custom_id: string;
    description: string;
    payee?: { email_address: string };
    amount: UsdAmount & { breakdown: { item_total: UsdAmount } };
    items: { name: string; quantity: string; unit_amount: UsdAmount; category: "PHYSICAL_GOODS" | "DIGITAL_GOODS" }[];
    shipping?: {
      type: "SHIPPING";
      name: { full_name: string };
      address: { address_line_1: string; admin_area_2: string; admin_area_1: string; postal_code: string; country_code: string };
    };
  }[];
  payment_source: {
    paypal: {
      experience_context: {
        brand_name: string;
        shipping_preference: "SET_PROVIDED_ADDRESS" | "NO_SHIPPING";
        user_action: "PAY_NOW";
        return_url: string;
        cancel_url: string;
      };
    };
  };
};

export function buildOrderBody(i: CreatePayPalOrderInput): OrderBody {
  const gift = i.kind === "gift";
  const unitCents = gift ? i.amountCents : i.unitCents;
  const quantity = gift ? 1 : i.quantity;
  const total = formatUsd(unitCents * quantity);
  const name = i.title.slice(0, 127);
  const unit: OrderBody["purchase_units"][number] = {
    reference_id: i.orderId,
    custom_id: i.orderId,
    description: gift ? `Gift from ${i.senderName}`.slice(0, 127) : name,
    amount: { currency_code: "USD", value: total, breakdown: { item_total: { currency_code: "USD", value: total } } },
    items: [
      {
        name,
        quantity: String(quantity),
        unit_amount: { currency_code: "USD", value: formatUsd(unitCents) },
        category: gift ? "DIGITAL_GOODS" : "PHYSICAL_GOODS",
      },
    ],
  };
  if (gift) {
    unit.payee = { email_address: i.payeeEmail };
  } else {
    unit.shipping = {
      type: "SHIPPING",
      name: { full_name: i.shipTo.fullName },
      address: {
        address_line_1: i.shipTo.line1,
        admin_area_2: i.shipTo.city,
        admin_area_1: i.shipTo.state,
        postal_code: i.shipTo.postalCode,
        country_code: i.shipTo.countryCode,
      },
    };
  }
  return {
    intent: "CAPTURE",
    purchase_units: [unit],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: gift ? "CareCart" : "CareCart Demo Store",
          shipping_preference: gift ? "NO_SHIPPING" : "SET_PROVIDED_ADDRESS",
          user_action: "PAY_NOW",
          return_url: i.returnUrl,
          cancel_url: i.cancelUrl,
        },
      },
    },
  };
}

export async function createPayPalOrder(input: CreatePayPalOrderInput, f: Fetch = fetch): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const res = await call<{ id: string; links?: { rel: string; href: string }[] }>(
    f,
    "/v2/checkout/orders",
    JSON.stringify(buildOrderBody(input)),
    input.requestId,
  );
  const link = res.links?.find((l) => l.rel === "payer-action") ?? res.links?.find((l) => l.rel === "approve");
  if (!link) throw new PayPalError("PayPal order has no approval link", 500, null, res);
  return { paypalOrderId: res.id, approveUrl: link.href };
}

type CaptureResponse = {
  status: string;
  purchase_units?: { payee?: { email_address?: string }; payments?: { captures?: { id: string; status: string }[] } }[];
};

export async function capturePayPalOrder(
  paypalOrderId: string,
  requestId: string,
  f: Fetch = fetch,
): Promise<{ orderStatus: string; captureId: string | null; captureStatus: string | null; payeeEmail?: string }> {
  const res = await call<CaptureResponse>(f, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, undefined, requestId);
  const unit = res.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0] ?? null;
  return { orderStatus: res.status, captureId: capture?.id ?? null, captureStatus: capture?.status ?? null, payeeEmail: unit?.payee?.email_address };
}

export async function addTracking(paypalOrderId: string, captureId: string, tracking: Tracking, f: Fetch = fetch): Promise<void> {
  await call(
    f,
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/track`,
    JSON.stringify({ capture_id: captureId, tracking_number: tracking.number, carrier: tracking.carrier, notify_payer: false }),
  );
}

export async function verifyWebhook(headers: Headers, rawBody: string, f: Fetch = fetch): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const fields = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
  };
  if (Object.values(fields).some((v) => !v)) return false;
  // Splice the raw event in byte-for-byte; re-serialising it can break the signature check.
  const body = JSON.stringify(fields).slice(0, -1) + `,"webhook_event":${rawBody}}`;
  const res = await call<{ verification_status: string }>(f, "/v1/notifications/verify-webhook-signature", body);
  return res.verification_status === "SUCCESS";
}
