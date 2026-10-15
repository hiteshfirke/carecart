import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-[2rem] font-bold">CareCart</h1>
      <p className="text-[1.15rem]">Shop by voice. A safety check and a trusted family member protect every payment.</p>
      <p>This is a demo on the PayPal sandbox. No real money moves.</p>
      <form action="/api/demo/start" method="post" className="flex flex-col gap-3">
        <button name="role" value="senior" className="btn btn-primary" type="submit">
          Try as Rose (shopper)
        </button>
        <button name="role" value="caregiver" className="btn" type="submit">
          Try as Anna (caregiver)
        </button>
      </form>
      <form action="/api/demo/start" method="post">
        <input type="hidden" name="fresh" value="1" />
        <button name="role" value="senior" className="btn w-full" type="submit">
          Start a fresh demo
        </button>
      </form>
      <nav aria-label="More pages">
        <ul className="flex gap-6">
          <li>
            <Link href="/orders" className="underline">
              Orders
            </Link>
          </li>
          <li>
            <Link href="/store" className="underline">
              Demo store
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
