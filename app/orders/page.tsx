import Link from "next/link";
import { redirect } from "next/navigation";
import { listOrders } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { errorMessage } from "@/lib/errors";
import { isWaitingGift } from "@/lib/gifts";
import { formatUsd } from "@/lib/money";
import { toOrderView } from "@/lib/orders/view";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const household = await currentHousehold();
  if (!household) redirect("/");
  const sp = await searchParams;
  const orders = (await listOrders(household.senior.id, 20)).map((o) => ({ ...toOrderView(o, household.caregiver.name), canSend: isWaitingGift(o) }));
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <h1 className="text-[1.6rem] font-bold">{household.senior.name}&apos;s orders</h1>
      {errorMessage(sp.error) ? <p role="alert">{errorMessage(sp.error)}</p> : null}
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.id} className="rounded-2xl border-[3px] p-4">
            <p className="font-bold">
              {o.title}: ${formatUsd(o.totalCents)}
            </p>
            {o.kind === "gift" ? <p>To {o.recipient}</p> : null}
            <p>Status: {o.statusWords}.</p>
            {o.tracking ? (
              <p>
                {o.tracking.carrier} tracking number {o.tracking.number}
              </p>
            ) : null}
            {o.canSend ? (
              <form method="post" action={`/api/orders/${o.id}/pay?redirect=1`} className="mt-3">
                <button className="btn btn-primary w-full" aria-label={`Send it to ${o.recipient}`}>
                  Send it
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      <Link href="/talk" className="btn btn-primary inline-flex items-center justify-center">
        Back to talking
      </Link>
    </div>
  );
}
