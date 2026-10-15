import { NextResponse } from "next/server";
import { z } from "zod";
import * as db from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { assessRisk } from "@/lib/risk";
import { createPayPalOrder } from "@/lib/paypal";
import { sendEmail } from "@/lib/email";
import { confirmOrder } from "@/lib/confirm";

const Body = z.object({ duplicateAcknowledged: z.boolean().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const household = await currentHousehold();
  if (!household) return NextResponse.json({ outcome: "error", message: "Please start the demo from the home page." }, { status: 401 });
  const { id } = await params;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  const outcome = await confirmOrder(
    {
      getOrder: db.getOrder,
      ruleHistory: db.ruleHistory,
      userUtterances: db.userUtterances,
      assessRisk: (input) => assessRisk(input),
      transitionOrder: db.transitionOrder,
      createPayPalOrder: (input) => createPayPalOrder(input),
      sendEmail,
      appUrl: process.env.APP_URL ?? new URL(req.url).origin,
      caregiverEmail: household.caregiver.email ?? process.env.DEMO_CAREGIVER_EMAIL ?? null,
    },
    household,
    id,
    body.success ? body.data.duplicateAcknowledged ?? false : false,
  );
  return NextResponse.json(outcome);
}
