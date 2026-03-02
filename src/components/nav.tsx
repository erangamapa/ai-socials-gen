"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CBBrandmark } from "@/components/cb-logo";

const NAV_ITEMS = [
  { href: "/create", label: "Create" },
  { href: "/library", label: "Library" },
  { href: "/rules", label: "Rules" },
  { href: "/dev", label: "Dev" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80">
      <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <CBBrandmark className="h-5 w-auto text-primary transition-colors group-hover:text-primary/80" />
          <span className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted-foreground">
            Forge
          </span>
        </Link>

        <div className="flex gap-1 ml-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-secondary/25 text-foreground ring-1 ring-secondary/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-linear-to-r from-primary/40 via-secondary/40 to-transparent" />
    </nav>
  );
}
