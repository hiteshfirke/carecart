import { currentHousehold } from "@/lib/demo";
import { SiteNav } from "./SiteNav";

// One header for every page. The menu needs a demo running: without Rose's cookie (Anna opening an
// email link on her own phone) its links would only bounce to the home page.
export async function SiteHeader() {
  const running = (await currentHousehold()) !== null;
  return <SiteNav running={running} />;
}
