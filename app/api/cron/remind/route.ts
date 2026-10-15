import { getHouseholdByUser, markReminded, ordersNeedingReminder } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { remindCaregivers } from "@/lib/caregiver";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const sent = await remindCaregivers({
    ordersNeedingReminder,
    householdForUser: getHouseholdByUser,
    markReminded,
    sendEmail,
    appUrl: process.env.APP_URL ?? new URL(req.url).origin,
    fallbackEmail: process.env.DEMO_CAREGIVER_EMAIL ?? null,
  });
  return Response.json({ sent });
}
