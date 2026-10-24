import { errorMessage } from "@/lib/errors";
import { getHousehold, getTrustedRequest } from "@/lib/db";
import { canUseTrustedRequest } from "@/lib/gifts";

type Search = { r?: string; t?: string; done?: string; error?: string };

// Opened from the email link, so there is no household cookie: the request id and token decide what is shown.
// Only fixed messages are shown. The name comes from the saved request, never from the URL.
export default async function AddPersonPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const request = sp.r ? await getTrustedRequest(sp.r) : null;
  const status = canUseTrustedRequest(request, sp.t ?? null, new Date());
  const household = request && status !== "invalid" ? await getHousehold(request.householdId) : null;

  if (!request || !household) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
        <h1 className="text-[1.6rem] font-bold">Add someone to the list</h1>
        <p role="alert">{errorMessage("link_invalid")}</p>
      </div>
    );
  }

  const { senior } = household;
  // A spent link whose redirect carries person_exists means the name was already on the list, not that it was added now.
  const note =
    status === "used"
      ? sp.done === "1"
        ? `${request.name} is on ${senior.name}'s list now.`
        : errorMessage(sp.error === "person_exists" ? "person_exists" : "link_used")
      : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <h1 className="text-[1.6rem] font-bold">
        Add {request.name} to {senior.name}&apos;s list
      </h1>
      {note ? <p role="status" className="font-bold">{note}</p> : null}
      {status === "ok" ? (
        <>
          <p>
            {senior.name} asked to send money to {request.name}. The money goes to the PayPal email you enter here, so check it before you save.
          </p>
          {sp.error === "bad_person" ? <p role="alert">{errorMessage("bad_person")}</p> : null}
          <form action="/api/caregiver/people/requests" method="post" className="flex flex-col gap-3">
            <input type="hidden" name="r" value={request.id} />
            <input type="hidden" name="t" value={sp.t} />
            <label htmlFor="relationship">Relationship to {senior.name} (optional)</label>
            <input id="relationship" name="relationship" maxLength={30} autoComplete="off" className="field" />
            <label htmlFor="paypalEmail">PayPal email</label>
            <input id="paypalEmail" name="paypalEmail" type="email" required autoComplete="off" className="field" />
            <button type="submit" className="btn btn-primary">
              Add {request.name}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
