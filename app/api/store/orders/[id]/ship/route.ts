import { NextResponse } from "next/server";
import { getOrder, transitionOrder } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { addTracking } from "@/lib/paypal";
import { shipOrder } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const household = await currentHousehold();
  if (!household) return NextResponse.redirect(new URL("/", req.url), 303);
  const { id } = await params;
  const result = await shipOrder({ getOrder, transitionOrder, addTracking: (pp, cap, t) => addTracking(pp, cap, t) }, id, household.senior.id);
  const target = result.ok ? `/store?shipped=${encodeURIComponent(id)}` : `/store?error=${result.code}`;
  return NextResponse.redirect(new URL(target, req.url), 303);
}
