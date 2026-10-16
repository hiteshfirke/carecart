import Link from "next/link";
import { errorMessage } from "@/lib/errors";
import { redirect } from "next/navigation";
import { listOrdersByStatus } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { formatUsd } from "@/lib/money";

export default async function StorePage({ searchParams }: { searchParams: Promise<{ shipped?: string; error?: string }> }) {
  const household = await currentHousehold();
  if (!household) redirect("/");
  const sp = await searchParams;
  const paid = await listOrdersByStatus(household.senior.id, ["PAID"]);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <h1 className="text-[1.6rem] font-bold">Demo store: orders to ship</h1>
      <p>This page plays the store. Shipping adds a tracking number to the PayPal order.</p>
      {sp.shipped ? <p role="status" className="font-bold">Shipped. Tracking was added in PayPal.</p> : null}
      {errorMessage(sp.error) ? <p role="alert">{errorMessage(sp.error)}</p> : null}
      {paid.length === 0 ? <p>No paid orders waiting.</p> : null}
      <ul className="flex flex-col gap-3">
        {paid.map((o) => (
          <li key={o.id} className="flex flex-col gap-2 rounded-2xl border-[3px] p-4">
            <p className="font-bold">
              {o.product.title}: ${formatUsd(o.totalCents)}
            </p>
            <form action={`/api/store/orders/${o.id}/ship`} method="post">
              <button type="submit" className="btn btn-primary">
                Ship and add tracking
              </button>
            </form>
          </li>
        ))}
      </ul>
      <Link href="/" className="underline">
        Home
      </Link>
    </div>
  );
}
