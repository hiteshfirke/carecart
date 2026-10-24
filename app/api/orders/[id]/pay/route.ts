import { NextResponse } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { createPayPalOrder } from "@/lib/paypal";
import { getOrder, isTrusted, setPaypalOrderId, transitionOrder } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { payGift } from "@/lib/gifts";

// Not found and PayPal down are their own statuses; every other refusal (not waiting, not trusted, changed) is a conflict.
const STATUS: Record<string, number> = { not_found: 404, paypal_down: 502 };

// Rose sends a gift Anna approved: this creates the PayPal order and returns the link she pays at.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const household = await currentHousehold();
  if (!household) return NextResponse.json({ error: "no_demo_session" }, { status: 401 });
  const { id } = await params;
  const result = await payGift(
    { getOrder, isTrusted, createPayPalOrder: (input) => createPayPalOrder(input), setPaypalOrderId, transitionOrder, appUrl: appUrl(req) },
    household,
    id,
  );
  if (new URL(req.url).searchParams.get("redirect") === "1") {
    return NextResponse.redirect(result.ok ? result.approveUrl : new URL(`/orders?error=${result.code}`, req.url), 303);
  }
  if (result.ok) return NextResponse.json({ approveUrl: result.approveUrl });
  return NextResponse.json({ error: result.code }, { status: STATUS[result.code] ?? 409 });
}
