import { paymentResultMessage } from "@/lib/speech/messages";
import { currentHousehold } from "@/lib/demo";

export default async function Home({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  // With a demo running, the main buttons continue it; only "fresh demo" starts a new Rose with no orders.
  const running = (await currentHousehold()) !== null;
  const verb = running ? "Continue as" : "Try as";
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-[2rem] font-bold">CareCart</h1>
      {payment ? (
        <p role="status" className="rounded-2xl border-[3px] p-4 text-[1.15rem]">
          {paymentResultMessage(null, payment, "your caregiver")}
        </p>
      ) : null}
      <p className="text-[1.15rem]">Shop by voice. A safety check and a trusted family member protect every payment.</p>
      <p>This is a demo on the PayPal sandbox. No real money moves.</p>
      <form action="/api/demo/start" method="post" className="flex flex-col gap-3">
        <button name="role" value="senior" className="btn btn-primary" type="submit">
          {verb} Rose (shopper)
        </button>
        <button name="role" value="caregiver" className="btn" type="submit">
          {verb} Anna (caregiver)
        </button>
      </form>
      <form action="/api/demo/start" method="post">
        <input type="hidden" name="fresh" value="1" />
        <button name="role" value="senior" className="btn w-full" type="submit">
          {running ? "Start a fresh demo (new Rose, no orders)" : "Start a fresh demo"}
        </button>
      </form>
    </div>
  );
}
