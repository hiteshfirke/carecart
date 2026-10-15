// Base URL for PayPal return/cancel URLs and caregiver email links.
// Never trust the request's Host header for these in production.
export function appUrl(req: Request): string {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL must be set in production");
  return new URL(req.url).origin;
}
