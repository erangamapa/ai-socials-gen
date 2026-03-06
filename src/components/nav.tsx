"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CBBrandmark } from "@/components/cb-logo";

const MAIN_NAV = [
  { href: "/create", label: "Create" },
  { href: "/library", label: "Library" },
  { href: "/rules", label: "Rules" },
  { href: "/dev", label: "Dev" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const linkClass = (href: string) => {
    const isActive = pathname === href || pathname.startsWith(href + "/");
    return `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "bg-secondary/25 text-foreground ring-1 ring-secondary/40"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
    }`;
  };

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80">
      <div className="max-w-6xl mx-auto px-4 flex items-center h-14">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <CBBrandmark className="h-5 w-auto text-primary transition-colors group-hover:text-primary/80" />
          <span className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted-foreground">
            Forge
          </span>
        </Link>

        {/* Center: Main nav */}
        <div className="flex gap-1 flex-1 justify-center">
          {MAIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href)}>
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1 shrink-0">
          <Link href="/how-it-works" className={linkClass("/how-it-works")}>
            How It Works
          </Link>
          {pathname !== "/login" && (
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Sign out
            </button>
          )}
        </div>
      </div>

      <div className="h-px bg-linear-to-r from-primary/40 via-secondary/40 to-transparent" />
    </nav>
  );
}
