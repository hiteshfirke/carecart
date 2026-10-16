import { NextResponse } from "next/server";
import { z } from "zod";
import { updateLimits } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";

const Limits = z.object({
  selfPay: z.coerce.number().int().min(1).max(1000),
  dailyCap: z.coerce.number().int().min(1).max(5000),
});

export async function POST(req: Request) {
  const household = await currentHousehold();
  if (!household) return NextResponse.redirect(new URL("/", req.url), 303);
  const form = await req.formData();
  const parsed = Limits.safeParse({ selfPay: form.get("selfPay"), dailyCap: form.get("dailyCap") });
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/caregiver?error=bad_limits", req.url), 303);
  }
  await updateLimits(household.senior.id, parsed.data.selfPay * 100, parsed.data.dailyCap * 100);
  return NextResponse.redirect(new URL("/caregiver?saved=1", req.url), 303);
}
