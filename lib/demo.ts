import { cookies } from "next/headers";
import { getHousehold, type Household } from "@/lib/db";

export const HOUSEHOLD_COOKIE = "cc_household";

export async function currentHousehold(): Promise<Household | null> {
  const id = (await cookies()).get(HOUSEHOLD_COOKIE)?.value;
  return id ? getHousehold(id) : null;
}
