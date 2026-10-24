import { NextResponse } from "next/server";
import { addTrustedPerson } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { PersonForm } from "@/lib/gifts";

// Anna adds someone Rose can send money to. Only the household's own cookie can change this list.
export async function POST(req: Request) {
  const household = await currentHousehold();
  if (!household) return NextResponse.redirect(new URL("/", req.url), 303);
  const form = await req.formData();
  const parsed = PersonForm.safeParse({
    name: form.get("name"),
    relationship: form.get("relationship") ?? undefined,
    paypalEmail: String(form.get("paypalEmail") ?? "").trim(),
  });
  if (!parsed.success) return NextResponse.redirect(new URL("/caregiver?error=bad_person", req.url), 303);
  const { name, relationship, paypalEmail } = parsed.data;
  const person = await addTrustedPerson(household.id, { name, relationship: relationship || null, paypalEmail });
  return NextResponse.redirect(new URL(person ? "/caregiver?person=added" : "/caregiver?error=person_exists", req.url), 303);
}
