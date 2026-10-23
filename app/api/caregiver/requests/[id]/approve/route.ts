import { NextResponse } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { getHouseholdByUser, getOrder, setPaypalOrderId, transitionOrder } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { createPayPalOrder } from "@/lib/paypal";
import { approveRequest } from "@/lib/caregiver";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = String((await req.formData()).get("t") ?? "") || null;
  const result = await approveRequest(
    {
      getOrder,
      householdForUser: getHouseholdByUser,
      transitionOrder,
      createPayPalOrder: (input) => createPayPalOrder(input),
      setPaypalOrderId,
      appUrl: appUrl(req),
    },
    id,
    { household: await currentHousehold(), token },
  );
  if (result.ok && result.approveUrl) return NextResponse.redirect(result.approveUrl, 303);
  const back = new URL(`/caregiver/requests/${id}`, req.url);
  // A gift has no PayPal page for Anna: she lands back here and sees that Rose will send it herself.
  if (result.ok) back.searchParams.set("approved", "1");
  else back.searchParams.set("error", result.code);
  if (token) back.searchParams.set("t", token);
  return NextResponse.redirect(back, 303);
}
