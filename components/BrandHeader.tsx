import Image from "next/image";

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="w-full border-b border-gray-100">
      <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/centro-logo.png"
            alt="Centro CDX"
            width={140}
            height={40}
            priority
            // If the file is missing the alt text renders, which is fine for dev.
          />
          <span className="hidden md:inline text-sm font-medium text-centro-ink/70">
            AI Recruiter
          </span>
        </div>
        {subtitle && (
          <span className="text-sm text-centro-ink/60 font-medium">{subtitle}</span>
        )}
      </div>
    </header>
  );
}
