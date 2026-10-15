import { redirect } from "next/navigation";
import { currentHousehold } from "@/lib/demo";
import { TalkScreen } from "@/components/TalkScreen";

export default async function TalkPage({ searchParams }: { searchParams: Promise<{ order?: string; payment?: string }> }) {
  const household = await currentHousehold();
  if (!household) redirect("/");
  const sp = await searchParams;
  return (
    <TalkScreen
      seniorName={household.senior.name}
      caregiverName={household.caregiver.name}
      returnedOrderId={sp.order ?? null}
      paymentResult={sp.payment ?? null}
    />
  );
}
