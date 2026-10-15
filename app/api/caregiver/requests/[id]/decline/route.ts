import { NextResponse } from "next/server";
import { getOrder, transitionOrder } from "@/lib/db";
import { declineRequest } from "@/lib/caregiver";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData();
  await declineRequest({ getOrder, transitionOrder }, id, String(form.get("reason") ?? ""));
  return NextResponse.redirect(new URL(`/caregiver/requests/${id}`, req.url), 303);
}
