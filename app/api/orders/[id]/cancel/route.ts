import { NextResponse } from "next/server";
import { getOrder, transitionOrder } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { seniorCanCancel } from "@/lib/orders/state";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const household = await currentHousehold();
  if (!household) return NextResponse.json({ error: "no_demo_session" }, { status: 401 });
  // My orders posts a plain form, so it gets a page back: My orders again, with a fixed message if it didn't work.
  const toOrders = (error?: string) => NextResponse.redirect(new URL(error ? `/orders?error=${error}` : "/orders", req.url), 303);
  const redirect = new URL(req.url).searchParams.get("redirect") === "1";
  const order = await getOrder((await params).id);
  if (!order || order.userId !== household.senior.id) return redirect ? toOrders("not_found") : NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!seniorCanCancel(order)) return redirect ? toOrders("not_waiting") : NextResponse.json({ error: "not_cancellable", status: order.status }, { status: 409 });
  const outcome = await transitionOrder(order.id, "CANCELLED", "senior", { declineReason: "cancelled_by_senior" });
  return redirect ? toOrders() : NextResponse.json({ status: outcome?.order.status ?? order.status });
}
