"use client";

import type { RefObject } from "react";
import type { OrderView } from "@/lib/orders/view";
import { formatUsd } from "@/lib/money";

export function ReadBack({ draft, headingRef, onConfirm, onCancel }: { draft: OrderView; headingRef: RefObject<HTMLHeadingElement | null>; onConfirm: () => void; onCancel: () => void }) {
  return (
    <section aria-labelledby="readback-h" className="flex flex-col gap-3 rounded-2xl border-[3px] p-4">
      <h2 id="readback-h" ref={headingRef} tabIndex={-1} className="text-[1.3rem] font-bold">
        Please check your order
      </h2>
      {draft.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.imageUrl} alt={draft.imageAlt} width={160} height={160} className="self-center rounded-lg bg-white object-contain" />
      ) : null}
      <p className="text-[1.2rem]">
        {draft.quantity > 1 ? `${draft.quantity} × ` : ""}
        {draft.title}
      </p>
      <p className="text-[1.6rem] font-bold">Total: ${formatUsd(draft.totalCents)}</p>
      <p>{draft.kind === "gift" ? `To ${draft.recipient ?? draft.merchant}` : `From ${draft.merchant}`}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary flex-1" onClick={onConfirm}>
          Confirm (Enter)
        </button>
        <button type="button" className="btn btn-danger flex-1" onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </section>
  );
}
