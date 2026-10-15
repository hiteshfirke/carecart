import { NextResponse } from "next/server";
import { defaultPaymentDeps, handleReturn } from "@/lib/payments";

export async function GET(req: Request) {
  const target = await handleReturn(defaultPaymentDeps, new URL(req.url).searchParams.get("token"));
  return NextResponse.redirect(new URL(target, req.url), 303);
}
