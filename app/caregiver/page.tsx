import Link from "next/link";
import { errorMessage } from "@/lib/errors";
import { redirect } from "next/navigation";
import { listOrders, listOrdersByStatus, listTrustedPeople } from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { formatUsd } from "@/lib/money";
import { toOrderView } from "@/lib/orders/view";

export default async function CaregiverPage({ searchParams }: { searchParams: Promise<{ saved?: string; person?: string; error?: string }> }) {
  const household = await currentHousehold();
  if (!household) redirect("/");
  const sp = await searchParams;
  const { senior, caregiver } = household;
  const [recent, waiting, people] = await Promise.all([
    listOrders(senior.id, 15),
    listOrdersByStatus(senior.id, ["AWAITING_CAREGIVER"]),
    listTrustedPeople(household.id),
  ]);
  const orders = recent.map((o) => toOrderView(o, caregiver.name, senior.name));
  // Queried by status, so an old request never drops out behind newer orders.
  const pending = waiting.map((o) => toOrderView(o, caregiver.name, senior.name));
  const personNote = sp.person === "added" ? "Added to the list." : sp.person === "removed" ? "Removed from the list." : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4">
      <h1 className="text-[1.8rem] font-bold">
        Hi {caregiver.name}, here&apos;s {senior.name}&apos;s shopping
      </h1>
      {sp.saved ? <p role="status" className="font-bold">Limits saved.</p> : null}
      {personNote ? <p role="status" className="font-bold">{personNote}</p> : null}
      {errorMessage(sp.error) ? <p role="alert">{errorMessage(sp.error)}</p> : null}

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
                  {o.kind === "gift" ? `Send $${formatUsd(o.totalCents)} to ${o.recipient ?? o.merchant}` : `${o.title}: $${formatUsd(o.totalCents)}`}
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

      <section aria-labelledby="people-h">
        <h2 id="people-h" className="text-[1.4rem] font-bold">
          People {senior.name} can send money to
        </h2>
        <ul className="mt-2 flex flex-col gap-3">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] p-4">
              <div>
                <p className="text-[1.15rem] font-bold">
                  {p.name}
                  {p.relationship ? `, ${p.relationship}` : ""}
                </p>
                <p>{p.paypalEmail}</p>
              </div>
              <form action={`/api/caregiver/people/${p.id}/remove`} method="post">
                <button type="submit" className="btn btn-danger">
                  Remove {p.name}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action="/api/caregiver/people" method="post" className="mt-4 flex flex-col gap-3">
          <label htmlFor="personName">Name</label>
          <input id="personName" name="name" required maxLength={40} autoComplete="off" className="field" />
          <label htmlFor="personRelationship">Relationship (optional)</label>
          <input id="personRelationship" name="relationship" maxLength={30} autoComplete="off" className="field" />
          <label htmlFor="personEmail">PayPal email</label>
          <input id="personEmail" name="paypalEmail" type="email" required autoComplete="off" className="field" />
          <button type="submit" className="btn btn-primary">
            Add to the list
          </button>
        </form>
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="text-[1.4rem] font-bold">
          Recent orders
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              {o.title}: ${formatUsd(o.totalCents)}, {o.statusWords}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
