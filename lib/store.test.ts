import { describe, expect, it } from "vitest";
import { shipOrder, trackingNumberFor, type StoreDeps } from "./store";
import type { Order, Tracking } from "./db";
import type { OrderStatus } from "./orders/state";

function setup(status: OrderStatus, opts: { trackingFails?: boolean; userId?: string } = {}) {
  const order = { id: "o1", userId: opts.userId ?? "rose", status, paypalOrderId: "PP1", captureId: "CAP1" } as Order;
  const tracked: { pp: string; cap: string; t: Tracking }[] = [];
  const moved: OrderStatus[] = [];
  const deps: StoreDeps = {
    getOrder: async () => order,
    addTracking: async (pp, cap, t) => {
      if (opts.trackingFails) throw new Error("422");
      tracked.push({ pp, cap, t });
    },
    transitionOrder: async (_id, to) => {
      moved.push(to);
      return { result: "applied", order };
    },
  };
  return { deps, tracked, moved };
}

describe("trackingNumberFor", () => {
  it("is a stable 22-digit USPS-style number", () => {
    const n = trackingNumberFor("o1");
    expect(n).toMatch(/^9400\d{18}$/);
    expect(trackingNumberFor("o1")).toBe(n);
    expect(trackingNumberFor("o2")).not.toBe(n);
  });
});

describe("shipOrder", () => {
  it("adds tracking to the PayPal capture, then marks SHIPPED", async () => {
    const { deps, tracked, moved } = setup("PAID");
    const result = await shipOrder(deps, "o1", "rose");
    expect(result.ok).toBe(true);
    expect(tracked[0]).toMatchObject({ pp: "PP1", cap: "CAP1", t: { carrier: "USPS" } });
    expect(moved).toEqual(["SHIPPED"]);
  });

  it("only ships paid orders from the same household", async () => {
    expect((await shipOrder(setup("AWAITING_PAYMENT").deps, "o1", "rose")).ok).toBe(false);
    expect((await shipOrder(setup("PAID", { userId: "other" }).deps, "o1", "rose")).ok).toBe(false);
  });

  it("does not mark shipped if PayPal rejects the tracking", async () => {
    const { deps, moved } = setup("PAID", { trackingFails: true });
    expect((await shipOrder(deps, "o1", "rose")).ok).toBe(false);
    expect(moved).toEqual([]);
  });
});
