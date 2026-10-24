import { redirect } from "next/navigation";
import { currentHousehold } from "@/lib/demo";
import { listOrdersByStatus } from "@/lib/db";
import { isWaitingGift } from "@/lib/gifts";
import { toOrderView } from "@/lib/orders/view";
import { TalkScreen } from "@/components/TalkScreen";

export default async function TalkPage({ searchParams }: { searchParams: Promise<{ order?: string; payment?: string }> }) {
  const household = await currentHousehold();
  if (!household) redirect("/");
  const sp = await searchParams;
  // Coming back from PayPal, the result message speaks for that order, so no "send it" prompt on top of it.
  // Only the view goes to the browser, never the raw order with its PayPal id.
  const waiting = sp.order ? undefined : (await listOrdersByStatus(household.senior.id, ["AWAITING_PAYMENT"])).find(isWaitingGift);
  return (
    <TalkScreen
      seniorName={household.senior.name}
      caregiverName={household.caregiver.name}
      returnedOrderId={sp.order ?? null}
      paymentResult={sp.payment ?? null}
      waitingGift={waiting ? toOrderView(waiting, household.caregiver.name) : null}
    />
  );
}
