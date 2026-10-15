import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl } from "./appUrl";

const req = new Request("https://evil.example/api/orders/1/confirm");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appUrl", () => {
  it("uses the configured APP_URL, without a trailing slash, never the request host", () => {
    vi.stubEnv("APP_URL", "https://carecart.vercel.app/");
    expect(appUrl(req)).toBe("https://carecart.vercel.app");
  });

  it("refuses to build links from the request host in production", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => appUrl(req)).toThrow(/APP_URL/);
  });

  it("falls back to the request origin in local development", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(appUrl(new Request("http://localhost:3000/api/x"))).toBe("http://localhost:3000");
  });
});
