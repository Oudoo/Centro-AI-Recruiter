"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { NetworkStatus } from "@/components/NetworkStatus";

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [acknowledgedNetwork, setAcknowledgedNetwork] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canStart =
    name.trim().length > 1 && /@/.test(email) && consent && acknowledgedNetwork;

  const handleStart = () => {
    if (!canStart) return;
    setSubmitting(true);
    const sessionId = crypto.randomUUID();
    const params = new URLSearchParams({ name: name.trim(), email: email.trim() });
    // Route through identity verification first; verify page redirects to /screen on pass
    router.push(`/verify/${sessionId}?${params.toString()}`);
  };

  return (
    <>
      <BrandHeader subtitle="AI Screening · v1.0" />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-bold text-centro-primary">
          Welcome to your Centro CDX screening
        </h1>
        <p className="mt-3 text-centro-ink/70 leading-relaxed">
          This is a short <strong>video-recorded</strong> AI-led conversation (~5
          minutes) about your customer service experience and spoken English. You'll
          talk on-camera with Maya, our AI recruiter. Find a quiet, well-lit space,
          make sure your microphone and camera work, and tap Start when you're ready.
        </p>
        <p className="mt-2 text-sm text-centro-ink/60">
          Both your <strong>voice and video</strong> are recorded throughout the
          session for review by Centro CDX recruiters.
        </p>

        <div className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ahmed Hamed"
              className="w-full rounded-md border border-gray-300 px-4 py-2.5 focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ahmed@example.com"
              className="w-full rounded-md border border-gray-300 px-4 py-2.5 focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
            />
          </div>

          <label className="flex items-start gap-3 text-sm text-centro-ink/80 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-centro-primary focus:ring-centro-primary"
            />
            <span>
              I understand the <strong>full session (voice + video)</strong> will be
              recorded and analyzed by an AI system to assess my suitability for the
              role. I'll also be asked to verify my identity by submitting a photo of
              my national ID + a live selfie (matched via AWS Rekognition, not
              retained). I consent to processing of this data by Centro CDX for
              recruitment purposes only.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-centro-ink/80 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledgedNetwork}
              onChange={(e) => setAcknowledgedNetwork(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-centro-primary focus:ring-centro-primary"
            />
            <span>
              I have a stable internet connection and understand the session may
              disconnect if my connection is weak.
            </span>
          </label>
        </div>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-amber-900">
              Internet connection matters
            </h2>
            <NetworkStatus pingIntervalMs={4000} />
          </div>
          <p className="text-sm text-amber-900/85 leading-relaxed">
            This session runs over a real-time voice connection. A weak or unstable
            internet link will disconnect Maya and end your screening early. Before
            starting, please:
          </p>
          <ul className="mt-2 text-sm text-amber-900/85 list-disc list-inside space-y-0.5">
            <li>Use a wired connection or sit close to your wifi router</li>
            <li>Close other apps using bandwidth (video calls, downloads, streaming)</li>
            <li>Use Chrome or Edge if possible (best WebRTC support)</li>
            <li>Allow microphone and camera access when the browser asks</li>
          </ul>
        </div>

        <button
          onClick={handleStart}
          disabled={!canStart || submitting}
          className="centro-btn w-full mt-6"
        >
          {submitting ? "Loading..." : "Start Screening"}
        </button>

        <p className="mt-12 text-xs text-centro-ink/50 text-center">
          v1.0.0 · centro-ai-recruiter
        </p>
      </main>
    </>
  );
}
