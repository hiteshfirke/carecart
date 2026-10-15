import { NextResponse } from "next/server";
import { defaultPaymentDeps, handleCancel } from "@/lib/payments";

export async function GET(req: Request) {
  const target = await handleCancel(defaultPaymentDeps, new URL(req.url).searchParams.get("token"));
  return NextResponse.redirect(new URL(target, req.url), 303);
}
