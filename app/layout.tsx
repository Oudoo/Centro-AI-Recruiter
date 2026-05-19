import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Centro CDX · AI Recruiter",
  description: "AI-powered screening for Centro CDX recruitment"
  // Favicon is auto-served from app/icon.png (App Router convention).
  // To replace: drop your Centro icon at app/icon.png — Next.js picks it up automatically.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-centro-paper text-centro-ink antialiased">
        {children}
      </body>
    </html>
  );
}
