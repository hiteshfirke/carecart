import { NextResponse } from "next/server";
// Aliased because the linter reads any function named use... as a React hook.
import { getTrustedRequest, useTrustedRequest as spendTrustedRequest } from "@/lib/db";
import { canUseTrustedRequest, PersonForm } from "@/lib/gifts";

// The link from an add-person email works without Rose's cookie: the request id and its random token are the proof.
export async function POST(req: Request) {
  const form = await req.formData();
  const id = String(form.get("r") ?? "");
  const token = String(form.get("t") ?? "");
  const back = (extra: Record<string, string>) => {
    const url = new URL("/caregiver/people/add", req.url);
    url.searchParams.set("r", id);
    url.searchParams.set("t", token);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    return NextResponse.redirect(url, 303);
  };

  const request = await getTrustedRequest(id);
  const status = canUseTrustedRequest(request, token, new Date());
  if (!request || status !== "ok") return back({ error: status === "used" ? "link_used" : "link_invalid" });

  // The name comes from the request, never from the form.
  const parsed = PersonForm.omit({ name: true }).safeParse({
    relationship: form.get("relationship") ?? undefined,
    paypalEmail: String(form.get("paypalEmail") ?? "").trim(),
  });
  if (!parsed.success) return back({ error: "bad_person" });

  const person = await spendTrustedRequest(request.id, { relationship: parsed.data.relationship || null, paypalEmail: parsed.data.paypalEmail });
  if (person) return back({ done: "1" });
  // Nothing was added. The link is spent in two cases: the name was already on the list (or a double submit won),
  // which must not read as "already added"; or it expired a moment ago.
  const after = canUseTrustedRequest(await getTrustedRequest(request.id), token, new Date());
  return back({ error: after === "used" ? "person_exists" : "link_invalid" });
}
