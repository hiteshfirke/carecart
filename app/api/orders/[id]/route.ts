import { NextResponse } from "next/server";
import { getOrder } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { toOrderView } from "@/lib/orders/view";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const household = await currentHousehold();
  if (!household) return NextResponse.json({ error: "no_demo_session" }, { status: 401 });
  const order = await getOrder((await params).id);
  if (!order || order.userId !== household.senior.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toOrderView(order, household.caregiver.name));
}
