"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links: Array<{ href: string; label: string; badge?: string }> = [
  { href: "/admin", label: "Candidates" },
  { href: "/admin/routing", label: "Role routing" },
  { href: "/admin/forge", label: "Forge" },
  { href: "/admin/bias", label: "Bias audit" },
  { href: "/admin/sourcing", label: "Sourcing" },
  { href: "/admin/usage", label: "Usage" }
];

export function AdminNav() {
  const path = usePathname();
  return (
    <header className="w-full bg-centro-primary text-white">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-6">
        <Link href="/admin" className="flex items-center gap-3 shrink-0">
          <Image
            src="/centro-logo.png"
            alt="Centro CDX"
            width={120}
            height={32}
            priority
            className="brightness-0 invert"
          />
          <span className="hidden sm:inline text-sm font-medium opacity-80">
            AI Recruiter · Recruiter Console
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active =
              l.href === "/admin" ? path === "/admin" : path?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/20 text-white"
                    : "text-white/75 hover:text-white hover:bg-white/10"
                }`}
              >
                {l.label}
                {l.badge && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-70">
                    {l.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="text-xs opacity-70">
          v1.0 · {process.env.NEXT_PUBLIC_ENV_LABEL ?? "dev"}
        </div>
      </div>
    </header>
  );
}
