// Pages show only these fixed messages. Text from the URL is never displayed,
// so a crafted link can't put a scammer's words inside CareCart.
const MESSAGES = {
  not_found: "This request was not found.",
  not_waiting: "This request has already been handled.",
  paypal_down: "PayPal isn't answering right now. Nothing was charged. Please try again.",
  request_changed: "This request just changed. Please reload the page and try again.",
  bad_limits: "Please enter whole dollar amounts.",
  order_not_found: "Order not found.",
  not_shippable: "Only paid orders can be shipped.",
  tracking_rejected: "PayPal didn't accept the tracking number. Please try again.",
} as const;

export type ErrorCode = keyof typeof MESSAGES;

export function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return code in MESSAGES ? MESSAGES[code as ErrorCode] : "Something went wrong. Please try again.";
}
