import { speakUsd } from "@/lib/money";
import type { ProductOption } from "@/lib/channel3";
import type { Order, OrderKind, Role, Tracking } from "@/lib/db";
import type { OrderStatus } from "./state";

export type OrderView = {
  id: string;
  title: string;
  imageUrl: string | null;
  imageAlt: string;
  quantity: number;
  totalCents: number;
  totalWords: string;
  merchant: string;
  kind: OrderKind;
  recipient: string | null;
  status: OrderStatus;
  statusWords: string;
  flags: string[];
  tracking: Tracking | null;
  declineReason: string | null;
  payerRole: Role | null;
  summary: string | null;
};

export type OptionView = {
  title: string;
  priceCents: number;
  priceWords: string;
  merchant: string;
  imageUrl: string | null;
  imageAlt: string;
  rating: number | null;
};

export function merchantName(domain: string): string {
  const base = domain.replace(/^www\./, "").split(".")[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function readBack(o: Pick<Order, "product" | "quantity" | "totalCents" | "merchant" | "kind" | "payee">): string {
  if (o.kind === "gift") {
    const who = o.payee ? `${o.payee.name}${o.payee.relationship ? `, your ${o.payee.relationship}` : ""}` : o.merchant;
    return `You're sending ${speakUsd(o.totalCents)} to ${who}, through PayPal. Say "confirm" or press Confirm to continue, or say "cancel".`;
  }
  const what = o.quantity > 1 ? `${o.quantity} of ${o.product.title}` : o.product.title;
  return `You're buying ${what}, for ${speakUsd(o.totalCents)} in total, from ${merchantName(o.merchant)}. Say "confirm" or press Confirm to continue, or say "cancel".`;
}

export function statusWords(status: OrderStatus, caregiverName: string, kind: OrderKind = "purchase"): string {
  switch (status) {
    case "DRAFT":
      return "not confirmed yet";
    case "CONFIRMED":
      return "being checked";
    case "AWAITING_CAREGIVER":
      return `waiting for ${caregiverName} to approve`;
    case "AWAITING_PAYMENT":
      return kind === "gift" ? "approved, waiting for you to send it" : "waiting for the PayPal payment";
    case "PAID":
      return kind === "gift" ? "sent" : "paid, and the store is getting it ready";
    case "SHIPPED":
      return "shipped";
    case "DECLINED":
      return `not approved by ${caregiverName}`;
    case "CANCELLED":
      return "cancelled, and no payment was made";
    case "BLOCKED":
      return "stopped because it looked like a scam";
  }
}

export function toOrderView(o: Order, caregiverName: string): OrderView {
  return {
    id: o.id,
    title: o.product.title,
    imageUrl: o.product.imageUrl,
    imageAlt: o.product.imageAlt,
    quantity: o.quantity,
    totalCents: o.totalCents,
    totalWords: speakUsd(o.totalCents),
    merchant: o.payee?.name ?? merchantName(o.merchant),
    kind: o.kind,
    recipient: o.payee?.name ?? null,
    status: o.status,
    statusWords: statusWords(o.status, caregiverName, o.kind),
    flags: o.flags.map((f) => f.message),
    tracking: o.tracking,
    declineReason: o.declineReason,
    payerRole: o.payerRole,
    summary: o.summary,
  };
}

export function toOptionView(o: ProductOption): OptionView {
  return {
    title: o.title,
    priceCents: o.priceCents,
    priceWords: speakUsd(o.priceCents),
    merchant: merchantName(o.merchant),
    imageUrl: o.imageUrl,
    imageAlt: o.imageAlt,
    rating: o.rating,
  };
}
