import Link from "next/link";
import { notFound } from "next/navigation";
import { getHouseholdByUser, getOrder, userUtterances } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { canActOnRequest } from "@/lib/caregiver";
import { formatUsd } from "@/lib/money";
import { toOrderView } from "@/lib/orders/view";

const BANNERS: Record<string, string> = {
  paid: "Paid. They have been told.",
  pending: "PayPal is still checking the payment.",
  cancelled: "Payment cancelled. Nothing was charged.",
  failed: "The payment didn't go through. Nothing was charged.",
};

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string; error?: string; t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const order = await getOrder(id);
  // Only the household's own cookie or the token from Anna's email link may see or act on a request.
  if (!order || !canActOnRequest(order, { household: await currentHousehold(), token: sp.t ?? null })) notFound();
  const household = await getHouseholdByUser(order.userId);
  if (!household) notFound();

  const { senior, caregiver } = household;
  const view = toOrderView(order, caregiver.name);
  const said = order.sessionId ? (await userUtterances(order.sessionId)).slice(-5) : [];
  const canApprove = order.status === "AWAITING_CAREGIVER" || (order.status === "AWAITING_PAYMENT" && order.payerRole === "caregiver");
  const banner = sp.payment ? BANNERS[sp.payment] : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <h1 className="text-[1.6rem] font-bold">
        {senior.name} asked for {view.title}
      </h1>
      {banner ? <p role="status" className="font-bold">{banner}</p> : null}
      {sp.error ? <p role="alert">{sp.error}</p> : null}
      {view.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={view.imageUrl} alt={view.imageAlt} width={200} height={200} className="rounded-lg bg-white object-contain" />
      ) : null}
      <p className="text-[1.4rem] font-bold">
        Total: ${formatUsd(view.totalCents)}
        {view.quantity > 1 ? ` (${view.quantity} items)` : ""}
      </p>
      <p>
        From {view.merchant}. Status: {view.statusWords}.
      </p>

      {view.summary ? (
        <section aria-labelledby="summary-h">
          <h2 id="summary-h" className="font-bold">
            Summary
          </h2>
          <p>{view.summary}</p>
        </section>
      ) : null}
      {view.flags.length > 0 ? (
        <section aria-labelledby="flags-h">
          <h2 id="flags-h" className="font-bold">
            Why this needs you
          </h2>
          <ul className="list-disc pl-6">
            {view.flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {said.length > 0 ? (
        <section aria-labelledby="said-h">
          <h2 id="said-h" className="font-bold">
            What {senior.name} said
          </h2>
          <ul className="list-disc pl-6">
            {said.map((s, i) => (
              <li key={i}>&ldquo;{s}&rdquo;</li>
            ))}
          </ul>
        </section>
      ) : null}

      {canApprove ? (
        <form action={`/api/caregiver/requests/${order.id}/approve`} method="post">
          {sp.t ? <input type="hidden" name="t" value={sp.t} /> : null}
          <button type="submit" className="btn btn-primary w-full">
            Approve and pay with PayPal
          </button>
        </form>
      ) : null}
      {order.status === "AWAITING_CAREGIVER" ? (
        <form action={`/api/caregiver/requests/${order.id}/decline`} method="post" className="flex flex-col gap-2">
          {sp.t ? <input type="hidden" name="t" value={sp.t} /> : null}
          <label htmlFor="reason">Reason for {senior.name} (optional)</label>
          <textarea id="reason" name="reason" maxLength={200} rows={2} className="field py-2" />
          <button type="submit" className="btn btn-danger">
            Decline
          </button>
        </form>
      ) : null}
      <Link href="/caregiver" className="underline">
        Back to dashboard
      </Link>
    </div>
  );
}
