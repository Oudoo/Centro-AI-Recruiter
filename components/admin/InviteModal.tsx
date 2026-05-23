"use client";

import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultRecruiterEmail?: string;
};

type Result = {
  invitationCode: string;
  pin: string;
  candidateEmail: string;
  expiresAt: string;
  ttlHours: number;
  url: string;
  inviteChannel?: "Email" | "WhatsApp";
  genesysResult?: {
    success: boolean;
    mode: "mock" | "production";
    messageId?: string;
    error?: string;
  } | null;
};

export function InviteModal({ open, onClose, defaultRecruiterEmail }: Props) {
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidateFullName, setCandidateFullName] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [targetPosition, setTargetPosition] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(48);
  const [recruiterEmail, setRecruiterEmail] = useState(defaultRecruiterEmail ?? "");
  const [notes, setNotes] = useState("");
  const [inviteChannel, setInviteChannel] = useState<"Email" | "WhatsApp">("Email");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  if (!open) return null;

  const isPhoneValid =
    inviteChannel === "WhatsApp"
      ? candidatePhone.trim().startsWith("+") && candidatePhone.trim().length > 4
      : true;

  const valid =
    /@/.test(candidateEmail) &&
    /@/.test(recruiterEmail) &&
    expiresInHours > 0 &&
    isPhoneValid;

  const handleSubmit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateEmail: candidateEmail.trim(),
          candidateFullName: candidateFullName.trim(),
          candidatePhone: candidatePhone.trim(),
          targetPosition: targetPosition.trim(),
          createdBy: recruiterEmail.trim(),
          expiresInHours,
          notes: notes.trim(),
          inviteChannel
        })
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? "Could not create invitation.");
        return;
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const closeAndReset = () => {
    setCandidateEmail("");
    setCandidateFullName("");
    setCandidatePhone("");
    setTargetPosition("");
    setNotes("");
    setInviteChannel("Email");
    setResult(null);
    setError(null);
    onClose();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-centro-primary">
            {result ? "Invitation created" : "Invite a candidate"}
          </h2>
          <button
            onClick={closeAndReset}
            className="text-centro-ink/60 hover:text-centro-ink text-xl"
          >
            ×
          </button>
        </div>

        {!result ? (
          <>
            <div className="px-6 py-5 space-y-3 text-sm">
              {/* Delivery Channel Selector */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1.5">
                  Delivery Channel
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setInviteChannel("Email")}
                    className={`py-2 px-3 rounded-md text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 ${
                      inviteChannel === "Email"
                        ? "bg-white text-centro-primary shadow-sm ring-1 ring-black/5"
                        : "text-centro-ink/65 hover:text-centro-ink"
                    }`}
                  >
                    <span>📧</span> Email Invitation
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteChannel("WhatsApp")}
                    className={`py-2 px-3 rounded-md text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 ${
                      inviteChannel === "WhatsApp"
                        ? "bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-400/20"
                        : "text-centro-ink/65 hover:text-centro-ink"
                    }`}
                  >
                    <span>💬</span> WhatsApp (Genesys)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                  Candidate email *
                </label>
                <input
                  type="email"
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                  placeholder="ahmed@example.com"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                    Candidate name
                  </label>
                  <input
                    type="text"
                    value={candidateFullName}
                    onChange={(e) => setCandidateFullName(e.target.value)}
                    placeholder="Ahmed Hamed"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                    Phone {inviteChannel === "WhatsApp" ? "*" : ""}
                  </label>
                  <input
                    type="text"
                    value={candidatePhone}
                    onChange={(e) => setCandidatePhone(e.target.value)}
                    placeholder={inviteChannel === "WhatsApp" ? "+96279..." : "+201..."}
                    className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
                      inviteChannel === "WhatsApp" && !isPhoneValid && candidatePhone.trim()
                        ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500"
                        : "border-gray-300 focus:border-centro-primary focus:ring-centro-primary"
                    }`}
                  />
                  {inviteChannel === "WhatsApp" && (
                    <span className="text-[10px] text-centro-ink/50 block mt-0.5">
                      Required with + country code (e.g. +96279...)
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                    Target position
                  </label>
                  <input
                    type="text"
                    value={targetPosition}
                    onChange={(e) => setTargetPosition(e.target.value)}
                    placeholder="Customer Service Agent"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                    Expires (hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(parseInt(e.target.value) || 48)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                  Your email (recruiter) *
                </label>
                <input
                  type="email"
                  value={recruiterEmail}
                  onChange={(e) => setRecruiterEmail(e.target.value)}
                  placeholder="recruiter@centrocdx.com"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                  Notes (internal)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Referred by John, follow-up after interview"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
                />
              </div>

              {error && (
                <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-900">
                  {error}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={closeAndReset}
                className="px-4 py-2 rounded text-sm font-medium text-centro-ink/75 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!valid || submitting}
                className="centro-btn"
              >
                {submitting ? "Creating..." : "Create invitation"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 py-5 space-y-4 text-sm">
              {result.inviteChannel === "WhatsApp" ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs text-emerald-950 flex flex-col gap-1">
                  <strong className="text-emerald-900 flex items-center gap-1">
                    <span>✓</span> WhatsApp Outbound Triggered via Genesys!
                  </strong>
                  <p className="opacity-90">
                    The screening invitation was successfully dispatched to candidate{" "}
                    <strong>{candidatePhone}</strong>. If in mock mode, the outbound link and
                    PIN have been printed to the developer console log.
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs text-emerald-950">
                  <strong>✓ Email Invitation Created.</strong> Send the candidate BOTH the
                  URL and the PIN, ideally on separate channels (URL by email, PIN by SMS/WhatsApp)
                  for security.
                </div>
              )}

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                  Screening URL
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={result.url}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-mono"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => copy(result.url)}
                    className="px-3 py-2 rounded bg-centro-primary text-white text-xs font-medium hover:bg-centro-primary/90"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
                  6-digit PIN
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={result.pin}
                    className="flex-1 rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-2 text-2xl text-center tabular-nums tracking-[0.4em] font-bold"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => copy(result.pin)}
                    className="px-3 py-2 rounded bg-amber-500 text-white text-xs font-medium hover:bg-amber-600"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="text-xs text-centro-ink/60 space-y-1">
                <p>
                  <strong>Candidate:</strong> {result.candidateEmail}
                </p>
                {candidatePhone && (
                  <p>
                    <strong>Phone:</strong> {candidatePhone}
                  </p>
                )}
                <p>
                  <strong>Expires:</strong>{" "}
                  {new Date(result.expiresAt).toLocaleString("en-GB")} ({result.ttlHours}{" "}
                  hours from now)
                </p>
                <p>
                  <strong>Invitation code:</strong>{" "}
                  <code>{result.invitationCode}</code>
                </p>
              </div>

              <button
                onClick={() => {
                  const text = `Hi! You've been invited to a Centro CDX AI screening.\n\nURL: ${result.url}\nPIN: ${result.pin}\n\nThe PIN expires in ${result.ttlHours} hours.`;
                  copy(text);
                }}
                className="w-full text-xs text-centro-primary hover:underline"
              >
                Copy a ready-made message to send the candidate ↗
              </button>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeAndReset} className="centro-btn">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
