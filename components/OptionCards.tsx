"use client";

import type { RefObject } from "react";
import type { OptionView } from "@/lib/orders/view";
import { formatUsd } from "@/lib/money";

export function OptionCards({ options, headingRef, onPick }: { options: OptionView[]; headingRef: RefObject<HTMLHeadingElement | null>; onPick: (index: number) => void }) {
  return (
    <section aria-labelledby="options-h">
      <h2 id="options-h" ref={headingRef} tabIndex={-1} className="text-[1.3rem] font-bold">
        Pick one (press 1, 2 or 3)
      </h2>
      <ol className="mt-2 grid gap-3">
        {options.map((o, i) => (
          <li key={i}>
            <button
              type="button"
              className="btn flex w-full items-center gap-4 text-left"
              aria-label={`Option ${i + 1}: ${o.title}, ${o.priceWords}, from ${o.merchant}`}
              onClick={() => onPick(i)}
            >
              {o.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.imageUrl} alt="" width={96} height={96} className="rounded-lg bg-white object-contain" />
              ) : null}
              <span>
                <span className="block text-[1.1rem]">
                  Option {i + 1}: {o.title}
                </span>
                <span className="block font-bold">${formatUsd(o.priceCents)}</span>
                <span className="block text-[var(--muted)]">
                  {o.merchant}
                  {o.rating ? `, ${o.rating.toFixed(1)} stars` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
