import { NextResponse } from "next/server";
import { getHouseholdByUser, getOrder, setPaypalOrderId, transitionOrder } from "@/lib/db";
import { createPayPalOrder } from "@/lib/paypal";
import { approveRequest } from "@/lib/caregiver";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await approveRequest(
    {
      getOrder,
      householdForUser: getHouseholdByUser,
      transitionOrder,
      createPayPalOrder: (input) => createPayPalOrder(input),
      setPaypalOrderId,
      appUrl: process.env.APP_URL ?? new URL(req.url).origin,
    },
    id,
  );
  const target = result.ok ? result.approveUrl : `/caregiver/requests/${id}?error=${encodeURIComponent(result.message)}`;
  return NextResponse.redirect(new URL(target, req.url), 303);
}
