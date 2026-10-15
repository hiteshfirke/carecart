import { NextResponse } from "next/server";
import { createHousehold } from "@/lib/db";
import { currentHousehold, HOUSEHOLD_COOKIE } from "@/lib/demo";

export async function POST(req: Request) {
  const form = await req.formData();
  const role = form.get("role") === "caregiver" ? "caregiver" : "senior";
  const fresh = form.get("fresh") === "1";
  const household = (!fresh && (await currentHousehold())) || (await createHousehold(process.env.DEMO_CAREGIVER_EMAIL ?? null));
  const res = NextResponse.redirect(new URL(role === "caregiver" ? "/caregiver" : "/talk", req.url), 303);
  res.cookies.set(HOUSEHOLD_COOKIE, household.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
