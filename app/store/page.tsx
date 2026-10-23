import Link from "next/link";
import { errorMessage } from "@/lib/errors";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrder, listOrdersByStatus } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { formatUsd } from "@/lib/money";

export default async function StorePage({ searchParams }: { searchParams: Promise<{ shipped?: string; error?: string }> }) {
  const household = await currentHousehold();
  if (!household) redirect("/");
  const sp = await searchParams;
  // Gifts are money sent to family, not goods, so there is nothing to ship.
  const paid = (await listOrdersByStatus(household.senior.id, ["PAID"])).filter((o) => o.kind === "purchase");
  // Name the order that just shipped, so a second click on the next row's button is not mistaken for a retry.
  const justShipped = z.string().uuid().safeParse(sp.shipped).success ? await getOrder(sp.shipped as string) : null;
  const shipped = justShipped?.userId === household.senior.id && justShipped.status === "SHIPPED" ? justShipped : null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <h1 className="text-[1.6rem] font-bold">Demo store: orders to ship</h1>
      <p>This page plays the store. Shipping adds a tracking number to the PayPal order.</p>
      {shipped ? (
        <p role="status" className="font-bold">
          Shipped {shipped.product.title}. Tracking {shipped.tracking?.number} ({shipped.tracking?.carrier}) was added in PayPal.
        </p>
      ) : sp.shipped ? (
        <p role="status" className="font-bold">Shipped. Tracking was added in PayPal.</p>
      ) : null}
      {errorMessage(sp.error) ? <p role="alert">{errorMessage(sp.error)}</p> : null}
      {paid.length === 0 ? (
        <p>No paid orders waiting.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {paid.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 rounded-2xl border-[3px] p-4">
              <p className="font-bold">
                {o.product.title}: ${formatUsd(o.totalCents)}
              </p>
              <form action={`/api/store/orders/${o.id}/ship`} method="post">
                <button type="submit" className="btn btn-primary">
                  Ship and add tracking<span className="sr-only"> for {o.product.title}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Link href="/talk" className="btn btn-primary inline-flex items-center justify-center">
        Back to Rose
      </Link>
    </div>
  );
}
