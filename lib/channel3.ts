import type { Cents } from "@/lib/money";

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
