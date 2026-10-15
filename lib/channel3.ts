import { toCents, type Cents } from "@/lib/money";

export type ProductOption = {
  productId: string;
  title: string;
  priceCents: Cents;
  merchant: string;
  url: string;
  imageUrl: string | null;
  imageAlt: string;
  rating: number | null;
  category: string | null;
};

type RawOffer = { url: string; domain: string; price: { price: number; currency: string }; availability: string };
type RawImage = { url: string; is_main_image?: boolean | null; alt_text?: string | null };
export type RawProduct = {
  id: string;
  title: string;
  images?: RawImage[] | null;
  category?: { title?: string | null } | null;
  offers?: RawOffer[] | null;
  ratings?: { value: number } | null;
};

export class ProductSearchError extends Error {}

const SEARCH_URL = "https://api.trychannel3.com/v1/search";
const UNSAFE_CHARS = new Set(["<", ">", "`", "{", "}", "[", "]"]);

// Store text is untrusted: it is spoken aloud and passed to the AI as data.
export function sanitizeText(text: string, max = 90): string {
  const cleaned = Array.from(text, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 || UNSAFE_CHARS.has(ch) ? " " : ch;
  }).join("");
  return cleaned.replace(/\s+/g, " ").trim().slice(0, max);
}

export function toOptions(products: RawProduct[], limit: number): ProductOption[] {
  const options: ProductOption[] = [];
  for (const p of products) {
    const offer = (p.offers ?? [])
      .filter((o) => o.price?.currency === "USD" && o.availability === "InStock")
      .sort((a, b) => a.price.price - b.price.price)[0];
    if (!offer) continue;
    const images = p.images ?? [];
    const image = images.find((i) => i.is_main_image) ?? images[0] ?? null;
    const title = sanitizeText(p.title);
    options.push({
      productId: p.id,
      title,
      priceCents: toCents(offer.price.price),
      merchant: offer.domain.toLowerCase(),
      url: offer.url,
      imageUrl: image?.url ?? null,
      imageAlt: sanitizeText(image?.alt_text ?? title, 120),
      rating: p.ratings?.value ?? null,
      category: p.category?.title ? sanitizeText(p.category.title, 60) : null,
    });
    if (options.length === limit) break;
  }
  return options;
}

export async function searchProducts(
  query: string,
  opts: { maxPriceCents?: number; limit?: number; timeoutMs?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ProductOption[]> {
  const key = process.env.CHANNEL3_API_KEY;
  if (!key) throw new ProductSearchError("CHANNEL3_API_KEY is not set");
  const filters: Record<string, unknown> = { availability: ["InStock"] };
  if (opts.maxPriceCents) filters.price = { max_price: opts.maxPriceCents / 100 };

  let res: Response;
  try {
    res = await fetchImpl(SEARCH_URL, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sanitizeText(query, 200), limit: 10, filters, config: { country: "US", currency: "USD" } }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
  } catch (err) {
    throw new ProductSearchError(`Channel3 request failed: ${(err as Error).name}`);
  }
  if (!res.ok) throw new ProductSearchError(`Channel3 search failed with status ${res.status}`);
  const data = (await res.json()) as { products?: RawProduct[] };
  return toOptions(data.products ?? [], opts.limit ?? 3);
}
