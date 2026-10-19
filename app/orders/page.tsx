import Link from "next/link";
import { redirect } from "next/navigation";
import { listOrders } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { formatUsd } from "@/lib/money";
import { toOrderView } from "@/lib/orders/view";

export default async function OrdersPage() {
  const household = await currentHousehold();
  if (!household) redirect("/");
  const orders = (await listOrders(household.senior.id, 20)).map((o) => toOrderView(o, household.caregiver.name));
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <h1 className="text-[1.6rem] font-bold">{household.senior.name}&apos;s orders</h1>
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.id} className="rounded-2xl border-[3px] p-4">
            <p className="font-bold">
              {o.title}: ${formatUsd(o.totalCents)}
            </p>
            <p>Status: {o.statusWords}.</p>
            {o.tracking ? (
              <p>
                {o.tracking.carrier} tracking number {o.tracking.number}
              </p>
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
