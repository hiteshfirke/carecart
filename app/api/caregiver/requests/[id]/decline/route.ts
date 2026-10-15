import { NextResponse } from "next/server";
import { getOrder, transitionOrder } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { declineRequest } from "@/lib/caregiver";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData();
  const token = String(form.get("t") ?? "") || null;
  await declineRequest({ getOrder, transitionOrder }, id, String(form.get("reason") ?? ""), { household: await currentHousehold(), token });
  const back = new URL(`/caregiver/requests/${id}`, req.url);
  if (token) back.searchParams.set("t", token);
  return NextResponse.redirect(back, 303);
}
