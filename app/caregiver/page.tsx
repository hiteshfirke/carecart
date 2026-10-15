import Link from "next/link";
import { redirect } from "next/navigation";
import { listOrders } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { formatUsd } from "@/lib/money";
import { toOrderView } from "@/lib/orders/view";

export default async function CaregiverPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const household = await currentHousehold();
  if (!household) redirect("/");
  const sp = await searchParams;
  const { senior, caregiver } = household;
  const orders = (await listOrders(senior.id, 15)).map((o) => toOrderView(o, caregiver.name));
  const pending = orders.filter((o) => o.status === "AWAITING_CAREGIVER");
  const recent = orders.filter((o) => o.status !== "DRAFT");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4">
      <h1 className="text-[1.8rem] font-bold">
        Hi {caregiver.name}, here&apos;s {senior.name}&apos;s shopping
      </h1>
      {sp.saved ? <p role="status" className="font-bold">Limits saved.</p> : null}
      {sp.error ? <p role="alert">{sp.error}</p> : null}

      <section aria-labelledby="pending-h">
        <h2 id="pending-h" className="text-[1.4rem] font-bold">
          Waiting for you ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p>Nothing needs your OK right now.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {pending.map((o) => (
              <li key={o.id} className="rounded-2xl border-[3px] p-4">
                <p className="text-[1.15rem] font-bold">
                  {o.title}: ${formatUsd(o.totalCents)}
                </p>
                {o.summary ? <p>{o.summary}</p> : null}
                <Link href={`/caregiver/requests/${o.id}`} className="btn btn-primary mt-2 inline-flex items-center">
                  Review this request
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="limits-h">
        <h2 id="limits-h" className="text-[1.4rem] font-bold">
          Spending limits
        </h2>
        <form action="/api/caregiver/limits" method="post" className="mt-2 flex flex-col gap-3">
          <label htmlFor="selfPay">{senior.name} can pay alone up to (dollars)</label>
          <input id="selfPay" name="selfPay" type="number" min={1} max={1000} step={1} defaultValue={Math.round(senior.selfPayLimitCents / 100)} className="field" />
          <label htmlFor="dailyCap">Daily limit (dollars)</label>
          <input id="dailyCap" name="dailyCap" type="number" min={1} max={5000} step={1} defaultValue={Math.round(senior.dailyCapCents / 100)} className="field" />
          <button type="submit" className="btn btn-primary">
            Save limits
          </button>
        </form>
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="text-[1.4rem] font-bold">
          Recent orders
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {recent.map((o) => (
            <li key={o.id}>
              {o.title}: ${formatUsd(o.totalCents)}, {o.statusWords}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
