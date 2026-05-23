"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";

export default function StartPage() {
  const params = useParams();
  const router = useRouter();
  const invitationCode = (params.invitationCode as string) ?? "";

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (pin.length !== 6) {
      setError("PIN should be 6 digits.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/start-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationCode, email, pin })
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.message ?? json.error ?? "Could not start session.");
        setSubmitting(false);
        return;
      }
      // Success — redirect to /verify with name/email pre-filled
      const qs = new URLSearchParams({
        name: json.candidateFullName ?? "",
        email: json.candidateEmail ?? ""
      });
      router.push(`/verify/${json.sessionId}?${qs.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <>
      <BrandHeader subtitle="Screening invitation" />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-bold text-centro-primary">
          Welcome to Centro CDX
        </h1>
        <p className="mt-3 text-sm text-centro-ink/70 leading-relaxed">
          Your recruiter sent you an email and a 6-digit PIN. Enter them below to start your AI
          screening.
        </p>

        <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
          <p className="text-centro-ink/60">Invitation code</p>
          <p className="font-mono text-centro-ink mt-0.5">{invitationCode}</p>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="candidate@example.com"
            className="w-full text-lg rounded-md border-2 border-gray-300 px-4 py-3 focus:border-centro-primary focus:outline-none focus:ring-2 focus:ring-centro-primary/30"
          />
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">PIN</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            className="w-full text-center text-3xl tabular-nums tracking-[0.4em] font-bold rounded-md border-2 border-gray-300 px-4 py-3 focus:border-centro-primary focus:outline-none focus:ring-2 focus:ring-centro-primary/30"
          />
        </div>

        {error && (
          <div className="mt-4 p-3 rounded bg-rose-50 border border-rose-200 text-sm text-rose-900">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || pin.length !== 6 || !email.includes("@")}
          className="centro-btn w-full mt-6"
        >
          {submitting ? "Validating PIN..." : "Start screening →"}
        </button>

        <p className="mt-8 text-xs text-centro-ink/50 text-center">
          Trouble? Reply to the message your recruiter sent and ask for a new
          invitation.
        </p>
      </main>
    </>
  );
}
