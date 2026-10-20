"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/talk", label: "Talk" },
  { href: "/orders", label: "My orders" },
  { href: "/caregiver", label: "Anna's page" },
  { href: "/store", label: "Demo store" },
];

// Which person's view this page is, so judges switching pages always know who they are.
function roleFor(path: string): { who: "rose" | "anna" | "store"; text: string } | null {
  if (path.startsWith("/caregiver")) return { who: "anna", text: "You are Anna, the caregiver" };
  if (path.startsWith("/store")) return { who: "store", text: "You are the shop (demo only)" };
  if (path.startsWith("/talk") || path.startsWith("/orders")) return { who: "rose", text: "You are Rose, the shopper" };
  return null;
}

function isCurrent(path: string, href: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function SiteNav({ running }: { running: boolean }) {
  const path = usePathname();
  const onHome = path === "/";
  if (!running && onHome) return null; // the home page already says CareCart and offers both roles
  const role = roleFor(path);
  return (
    <header className="site-header">
      {onHome ? null : <p className="wordmark">CareCart</p>}
      {running ? (
        <nav aria-label="Main" className="site-nav">
          <ul>
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} aria-current={isCurrent(path, link.href) ? "page" : undefined}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {running && role ? (
        <p className="role-band" data-role={role.who}>
          {role.text}
        </p>
      ) : null}
    </header>
  );
}
