// Manual sandbox check: can a PayPal order pay a family member's account directly (payee.email_address)?
// Touches no database. Needs DEMO_FAMILY_EMAIL (a sandbox personal account), APP_URL and the PayPal keys in .env.local.
//   npm run gift:spike -- create                    creates a $1.00 gift order and prints the approve URL
//   npm run gift:spike -- capture <paypalOrderId>   captures it once the buyer has approved
import { capturePayPalOrder, createPayPalOrder } from "@/lib/paypal";

async function create() {
  const payeeEmail = process.env.DEMO_FAMILY_EMAIL;
  if (!payeeEmail) throw new Error("DEMO_FAMILY_EMAIL is not set (check .env.local)");
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not set (check .env.local)");

  const stamp = `spike-${Date.now()}`;
  const { paypalOrderId, approveUrl } = await createPayPalOrder({
    kind: "gift",
    orderId: stamp,
    title: "Gift to Sam",
    amountCents: 100,
    payeeEmail,
    senderName: "Rose",
    returnUrl: `${appUrl}/`,
    cancelUrl: `${appUrl}/`,
    requestId: stamp,
  });
  console.log(`PayPal order: ${paypalOrderId}`);
  console.log(`Approve as the Rose sandbox buyer: ${approveUrl}`);
}

async function capture(paypalOrderId: string | undefined) {
  if (!paypalOrderId) throw new Error("Usage: npm run gift:spike -- capture <paypalOrderId>");
  const r = await capturePayPalOrder(paypalOrderId, `spike-capture-${paypalOrderId}`);
  console.log(`orderStatus:   ${r.orderStatus}`);
  console.log(`captureStatus: ${r.captureStatus}`);
  console.log(`payee:         ${r.payeeEmail ?? "(none reported)"}`);
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === "create") return create();
  if (command === "capture") return capture(arg);
  throw new Error("Pick one: create | capture <paypalOrderId>");
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
