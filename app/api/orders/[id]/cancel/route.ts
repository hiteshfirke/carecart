import { NextResponse } from "next/server";
import { getOrder, transitionOrder } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const household = await currentHousehold();
  if (!household) return NextResponse.json({ error: "no_demo_session" }, { status: 401 });
  const order = await getOrder((await params).id);
  if (!order || order.userId !== household.senior.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const outcome = await transitionOrder(order.id, "CANCELLED", "senior", { declineReason: "cancelled_by_senior" });
  return NextResponse.json({ status: outcome?.order.status ?? order.status });
}
