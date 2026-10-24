import type { OrderKind } from "@/lib/db";

export function caregiverSentMessage(caregiverName: string, emailed: boolean): string {
  if (emailed) return `This one needs ${caregiverName}'s OK. I've sent it to ${caregiverName}. I'll tell you as soon as there's an answer.`;
  // Never tell Rose an email went out when it didn't.
  return `This one needs ${caregiverName}'s OK. ${caregiverName} will see it on the CareCart page. I'll tell you as soon as there's an answer.`;
}

// Said when Anna has approved a gift and Rose still has to send it herself.
export function giftApprovedMessage(caregiverName: string, recipient: string | null): string {
  return `${caregiverName} said yes to your gift to ${recipient ?? "them"}. Say send it, and I'll open PayPal.`;
}

type ResultOrder = { title: string; totalWords: string; status: string; kind?: OrderKind; recipient?: string | null };

// What Rose sees and hears after coming back from PayPal.
export function paymentResultMessage(order: ResultOrder | null, payment: string, caregiverName: string): string {
  if (!order) return "I couldn't check the payment just now. Nothing was charged unless PayPal shows a payment. Please look at My orders.";
  if (payment === "paid" || order.status === "PAID" || order.status === "SHIPPED") {
    if (order.kind === "gift") return `Sent. ${order.recipient ?? "They"} got ${order.totalWords}.`;
    return `Paid ${order.totalWords} for ${order.title}. It's on the way.`;
  }
  if (payment === "pending") return "PayPal is still checking the payment. I'll tell you when it's done.";
  if (payment === "cancelled") return "No payment was made. What else do you need?";
  if (order.status === "DECLINED") return `${caregiverName} said not this time.`;
  return "The payment didn't go through, so nothing was charged.";
}
