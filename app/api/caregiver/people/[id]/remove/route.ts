import { NextResponse } from "next/server";
import { removeTrustedPerson } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const household = await currentHousehold();
  if (!household) return NextResponse.redirect(new URL("/", req.url), 303);
  const { id } = await params;
  // Scoped to this household, so another household's person can't be removed with a guessed id.
  await removeTrustedPerson(household.id, id);
  return NextResponse.redirect(new URL("/caregiver?person=removed", req.url), 303);
}
