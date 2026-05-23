"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { getUserCameraStream, captureFrame } from "@/lib/face-capture";

type Step = "id" | "selfie" | "verifying" | "result" | "cv" | "ready";

type CvUploadResult = {
  parsed: {
    fullName: string;
    email: string;
    phone: string;
    education: Array<{ degree: string; institution: string; year: string }>;
    workExperience: Array<{ company: string; role: string; duration: string; description: string }>;
    skills: string[];
    languages: string[];
    certifications: string[];
  };
  nameSimilarity: number;
  discrepancyFlag: boolean;
} | null;

type VerificationResult = {
  verified: boolean;
  confidence: number;
  threshold: number;
  hasFaceInId: boolean;
  hasFaceInSelfie: boolean;
  failureReason?: string;
  idInfo?: {
    idNameArabic: string;
    idNameEnglish: string;
    nationalId: string;
    dob: string;
  } | null;
};

export default function VerifyPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const sessionId = (params.sessionId as string) ?? "";
  const candidateName = search.get("name") ?? "Candidate";
  const candidateEmail = search.get("email") ?? "";

  const [step, setStep] = useState<Step>("id");
  const [idImage, setIdImage] = useState<Blob | null>(null);
  const [idImagePreview, setIdImagePreview] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<Blob | null>(null);
  const [selfieImagePreview, setSelfieImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // CV Upload states
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvResult, setCvResult] = useState<CvUploadResult>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Manage webcam stream lifecycle when selfie step is active
  useEffect(() => {
    if (step !== "selfie") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOn(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await getUserCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraOn(true);
      } catch (err) {
        setCameraError(
          err instanceof Error ? err.message : "Camera permission denied"
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  const handleIdFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, HEIC).");
      return;
    }
    if (file.size > 5_000_000) {
      setError("Image is over 5MB — please use a smaller file or screenshot.");
      return;
    }
    setError(null);
    setIdImage(file);
    setIdImagePreview(URL.createObjectURL(file));
  };

  const captureIdFromCamera = async () => {
    if (!videoRef.current) return;
    const base64 = captureFrame(videoRef.current, { maxWidth: 1024, quality: 0.8 });
    if (!base64) {
      setError("Couldn't capture the photo. Try again.");
      return;
    }
    const blob = base64ToBlob(base64, "image/jpeg");
    setIdImage(blob);
    setIdImagePreview(URL.createObjectURL(blob));
  };

  const captureSelfie = () => {
    if (!videoRef.current) return;
    const base64 = captureFrame(videoRef.current, { maxWidth: 1024, quality: 0.85 });
    if (!base64) {
      setError("Couldn't capture the selfie. Try again.");
      return;
    }
    const blob = base64ToBlob(base64, "image/jpeg");
    setSelfieImage(blob);
    setSelfieImagePreview(URL.createObjectURL(blob));
  };

  const submitVerification = async () => {
    if (!idImage || !selfieImage) return;
    setStep("verifying");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("idImage", idImage, "id.jpg");
      fd.append("selfieImage", selfieImage, "selfie.jpg");

      const res = await fetch("/api/verify-identity", { method: "POST", body: fd });
      const json = await res.json();

      if (json.error) {
        setError(json.error);
        setStep("selfie");
        return;
      }

      setResult(json);
      setStep("result");

      // Persist outcome for the screening page to read + attach to scoring
      sessionStorage.setItem(
        `centro-verification-${sessionId}`,
        JSON.stringify({
          verified: json.verified,
          confidence: json.confidence,
          threshold: json.threshold,
          method: "AWS_Rekognition_CompareFaces",
          verifiedAtIso: new Date().toISOString(),
          idInfo: json.idInfo
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("selfie");
    }
  };

  const continueToScreening = () => {
    const finalName = result?.idInfo?.idNameEnglish || candidateName;
    const params = new URLSearchParams({
      name: finalName,
      email: candidateEmail,
      cvName: cvResult?.parsed?.fullName || finalName
    });
    router.push(`/screen/${sessionId}?${params.toString()}`);
  };

  const uploadAndParseCv = async () => {
    if (!cvFile) return;
    setCvUploading(true);
    setCvError(null);
    try {
      const fd = new FormData();
      fd.append("file", cvFile);
      fd.append("idNameEnglish", result?.idInfo?.idNameEnglish || candidateName);
      fd.append("sessionId", sessionId);

      const res = await fetch("/api/upload-cv", { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) {
        setCvError(json.error);
        return;
      }

      const fullCvResult = {
        parsed: json.parsed,
        nameSimilarity: json.nameSimilarity,
        discrepancyFlag: json.discrepancyFlag
      };
      setCvResult(fullCvResult);
      sessionStorage.setItem(`centro-cv-${sessionId}`, JSON.stringify(fullCvResult));
      setStep("ready");
    } catch (err) {
      setCvError(err instanceof Error ? err.message : String(err));
    } finally {
      setCvUploading(false);
    }
  };

  const renderExtractedInfo = () => {
    if (!result?.idInfo) return null;
    const { idNameArabic, idNameEnglish, nationalId, dob } = result.idInfo;
    if (!idNameArabic && !idNameEnglish && !nationalId && !dob) return null;
    return (
      <div className="mt-6 border border-gray-200 bg-gray-50/50 rounded-lg p-5">
        <h3 className="text-xs font-bold text-centro-primary mb-3 uppercase tracking-wider">
          Parsed National ID Credentials (Locked)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
              Official Arabic Name (ID)
            </label>
            <input
              type="text"
              disabled
              value={idNameArabic || "Not detected"}
              className="w-full px-3 py-1.5 border border-gray-200 rounded bg-gray-100 text-centro-ink/75 cursor-not-allowed font-medium text-right font-arabic text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
              English Transliteration
            </label>
            <input
              type="text"
              disabled
              value={idNameEnglish || "Not detected"}
              className="w-full px-3 py-1.5 border border-gray-200 rounded bg-gray-100 text-centro-ink/75 cursor-not-allowed font-semibold text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
              14-Digit National ID Number
            </label>
            <input
              type="text"
              disabled
              value={nationalId || "Not detected"}
              className="w-full px-3 py-1.5 border border-gray-200 rounded bg-gray-100 text-centro-ink/75 cursor-not-allowed font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
              Derived Birth Date (YYMMDD Parsing)
            </label>
            <input
              type="text"
              disabled
              value={dob || "Not detected"}
              className="w-full px-3 py-1.5 border border-gray-200 rounded bg-gray-100 text-centro-ink/75 cursor-not-allowed font-mono text-sm"
            />
          </div>
        </div>
      </div>
    );
  };

  const retryFromStart = () => {
    setIdImage(null);
    setIdImagePreview(null);
    setSelfieImage(null);
    setSelfieImagePreview(null);
    setResult(null);
    setError(null);
    setStep("id");
  };

  return (
    <>
      <BrandHeader subtitle="Identity verification" />
      <main className="mx-auto max-w-2xl px-6 py-10 pb-24">
        {/* Progress dots */}
        <div className="flex items-center gap-3 mb-8">
          <ProgressDot label="ID document" active={step === "id"} done={!!idImage} />
          <div className="flex-1 h-0.5 bg-gray-200">
            <div
              className="h-full bg-centro-primary transition-all"
              style={{ width: idImage ? "100%" : "0%" }}
            />
          </div>
          <ProgressDot
            label="Selfie"
            active={step === "selfie"}
            done={!!selfieImage}
          />
          <div className="flex-1 h-0.5 bg-gray-200">
            <div
              className="h-full bg-centro-primary transition-all"
              style={{ width: selfieImage ? "100%" : "0%" }}
            />
          </div>
          <ProgressDot label="Verify" active={step === "verifying" || step === "result"} done={step === "result" || step === "cv" || step === "ready"} />
          <div className="flex-1 h-0.5 bg-gray-200">
            <div
              className="h-full bg-centro-primary transition-all"
              style={{ width: (step === "cv" || step === "ready") ? "100%" : "0%" }}
            />
          </div>
          <ProgressDot label="CV Upload" active={step === "cv"} done={step === "ready" || !!cvResult} />
        </div>

        {/* STEP: ID DOCUMENT */}
        {step === "id" && (
          <section>
            <h1 className="text-2xl font-bold text-centro-primary">
              Step 1 of 3 — Upload a photo of your ID
            </h1>
            <p className="mt-3 text-sm text-centro-ink/70 leading-relaxed">
              Take or upload a clear photo of your <strong>national ID card or
              passport</strong>. Make sure the photo on the ID is visible, in focus, and
              well-lit. We'll compare it against your selfie in the next step.
            </p>

            <div className="mt-2 text-xs text-centro-ink/60 bg-gray-50 border border-gray-200 rounded p-3">
              <strong>Privacy:</strong> the ID image is sent to AWS Rekognition for a
              face-match check, never stored long-term, and not retained outside this
              session. Centro CDX recruiters only see whether the verification passed,
              not the ID image itself.
            </div>

            {idImagePreview ? (
              <div className="mt-6">
                <img
                  src={idImagePreview}
                  alt="ID document"
                  className="w-full max-h-80 object-contain rounded-md border border-gray-200 bg-gray-50"
                />
                <div className="mt-4 flex gap-3">
                  <button onClick={() => setStep("selfie")} className="centro-btn">
                    Continue to selfie →
                  </button>
                  <button
                    onClick={() => {
                      setIdImage(null);
                      setIdImagePreview(null);
                    }}
                    className="px-4 py-2 rounded text-sm font-medium text-centro-ink/70 hover:bg-gray-50"
                  >
                    Replace photo
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-centro-primary hover:bg-centro-primary/[0.02] transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleIdFile(f);
                    }}
                    className="hidden"
                  />
                  <div className="text-4xl text-centro-primary/40 mb-2">📷</div>
                  <p className="font-medium text-centro-primary">Upload photo</p>
                  <p className="text-xs text-centro-ink/55 mt-1">
                    JPG, PNG, HEIC — under 5MB
                  </p>
                </label>
                <button
                  onClick={() => setStep("selfie")}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-centro-primary hover:bg-centro-primary/[0.02] transition-colors"
                >
                  <div className="text-4xl text-centro-primary/40 mb-2">📸</div>
                  <p className="font-medium text-centro-primary">Take photo now</p>
                  <p className="text-xs text-centro-ink/55 mt-1">
                    Use your webcam to capture
                  </p>
                </button>
              </div>
            )}
          </section>
        )}

        {/* STEP: SELFIE (also handles ID-from-camera capture if user picked that path) */}
        {step === "selfie" && (
          <section>
            <h1 className="text-2xl font-bold text-centro-primary">
              {idImage ? "Step 2 of 3 — Take a selfie" : "Take a photo of your ID"}
            </h1>
            <p className="mt-3 text-sm text-centro-ink/70 leading-relaxed">
              {idImage
                ? "Centre your face in the frame, look straight at the camera, and tap Capture. Make sure you're well-lit."
                : "Hold your ID card up to the camera. Centre the face on the ID in the frame and tap Capture."}
            </p>

            {cameraError ? (
              <div className="mt-6 p-4 rounded bg-rose-50 border border-rose-200 text-sm text-rose-900">
                <p className="font-semibold mb-1">Camera blocked</p>
                <p>{cameraError}</p>
                <p className="mt-2 opacity-80 text-xs">
                  Click the camera icon in your browser's address bar to allow access,
                  then refresh.
                </p>
              </div>
            ) : (
              <div className="mt-6 relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!cameraOn && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                    Awaiting camera permission...
                  </div>
                )}
                {cameraOn && (
                  <div className="absolute inset-12 border-4 border-white/30 rounded-full pointer-events-none" />
                )}
              </div>
            )}

            {(idImage ? selfieImagePreview : idImagePreview) && (
              <div className="mt-4">
                <p className="text-xs font-medium text-centro-ink/65 mb-2">Captured:</p>
                <img
                  src={(idImage ? selfieImagePreview : idImagePreview) ?? ""}
                  alt="Captured"
                  className="w-48 rounded border border-gray-200"
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={idImage ? captureSelfie : captureIdFromCamera}
                disabled={!cameraOn}
                className="centro-btn"
              >
                {idImage
                  ? selfieImagePreview
                    ? "Retake selfie"
                    : "Capture selfie"
                  : idImagePreview
                    ? "Retake ID photo"
                    : "Capture ID photo"}
              </button>

              {idImage && selfieImage && (
                <button onClick={submitVerification} className="centro-btn">
                  Submit for verification →
                </button>
              )}
              {!idImage && idImagePreview && (
                <button onClick={() => setStep("selfie")} className="centro-btn">
                  Continue to selfie →
                </button>
              )}

              <button
                onClick={() => setStep("id")}
                className="px-4 py-2 rounded text-sm font-medium text-centro-ink/70 hover:bg-gray-50"
              >
                ← Back
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded bg-rose-50 border border-rose-200 text-sm text-rose-900">
                {error}
              </div>
            )}
          </section>
        )}

        {/* STEP: VERIFYING */}
        {step === "verifying" && (
          <section className="py-12 text-center">
            <div className="inline-block w-16 h-16 border-4 border-centro-primary/20 border-t-centro-primary rounded-full animate-spin" />
            <h2 className="mt-8 text-xl font-medium">Verifying your identity</h2>
            <p className="mt-2 text-sm text-centro-ink/60">
              Comparing your selfie against your ID via AWS Rekognition. Takes about
              5–10 seconds.
            </p>
          </section>
        )}

        {/* STEP: RESULT */}
        {step === "result" && result && (
          <section>
            {result.verified ? (
              <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-full bg-emerald-500 text-white text-2xl flex items-center justify-center">
                    ✓
                  </span>
                  <h2 className="text-xl font-bold text-emerald-900">
                    Identity verified
                  </h2>
                </div>
                <p className="text-sm text-emerald-900/85">
                  Face match confidence:{" "}
                  <strong className="tabular-nums">
                    {result.confidence.toFixed(1)}%
                  </strong>{" "}
                  (threshold: {result.threshold}%). You're ready to upload your CV.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button onClick={() => setStep("cv")} className="centro-btn">
                    Continue to CV Upload →
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-full bg-amber-500 text-white text-2xl flex items-center justify-center">
                    !
                  </span>
                  <h2 className="text-xl font-bold text-amber-900">
                    Verification didn't pass
                  </h2>
                </div>
                <p className="text-sm text-amber-900/85">
                  {result.failureReason ??
                    `Face match confidence: ${result.confidence.toFixed(1)}% (need ${result.threshold}%).`}
                </p>
                <p className="mt-3 text-xs text-amber-900/75">
                  This doesn't necessarily mean you can't apply — it just means we
                  couldn't confirm the match automatically. You can retry with a clearer
                  photo, or continue to CV Upload and we'll flag this for a recruiter to review
                  manually.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button onClick={retryFromStart} className="centro-btn">
                    Try again with clearer photos
                  </button>
                  <button
                    onClick={() => setStep("cv")}
                    className="rounded-md border-2 border-amber-700 text-amber-900 px-6 py-3 font-medium hover:bg-amber-100"
                  >
                    Continue anyway (Proceed to CV Upload)
                  </button>
                </div>
              </div>
            )}
            {renderExtractedInfo()}
          </section>
        )}

        {/* STEP: CV UPLOAD */}
        {step === "cv" && (
          <section>
            <h1 className="text-2xl font-bold text-centro-primary animate-fade-in">
              Step 3 of 3 — Upload your CV
            </h1>
            <p className="mt-3 text-sm text-centro-ink/70 leading-relaxed">
              Upload your CV so we can match it against your verified identity, parse your details, and prepare your profile for screening.
            </p>

            <label className="mt-6 block border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-centro-primary hover:bg-centro-primary/[0.02] transition-colors shadow-sm">
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCvError(null);
                    setCvFile(f);
                  }
                }}
                className="hidden"
              />
              {cvFile ? (
                <div>
                  <div className="text-3xl text-centro-primary/60 mb-2">📄</div>
                  <p className="font-semibold text-centro-primary">{cvFile.name}</p>
                  <p className="text-xs text-centro-ink/55 mt-1">
                    {(cvFile.size / 1_000_000).toFixed(1)} MB · Click to replace
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl text-centro-primary/40 mb-2">📋</div>
                  <p className="font-medium text-centro-primary">
                    Drop your CV here or click to browse
                  </p>
                  <p className="text-xs text-centro-ink/55 mt-1">PDF or DOCX — under 10MB</p>
                </div>
              )}
            </label>

            {cvError && (
              <div className="mt-4 p-3 rounded bg-rose-50 border border-rose-200 text-sm text-rose-900">
                {cvError}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {cvFile && (
                <button
                  onClick={uploadAndParseCv}
                  disabled={cvUploading}
                  className="centro-btn"
                >
                  {cvUploading ? "Parsing CV..." : "Upload & parse CV →"}
                </button>
              )}
              <button
                onClick={() => setStep("ready")}
                className="px-4 py-2 rounded text-sm font-medium text-centro-ink/70 hover:bg-gray-50"
              >
                Skip CV upload (Proceed to screening) →
              </button>
            </div>
            
            <p className="mt-6 text-xs text-centro-ink/50 bg-gray-50/50 p-3 rounded border border-gray-150">
              <strong>Privacy:</strong> your CV is processed securely for field extraction. Our BPO recruitment team uses this to verify matching credentials against your government ID.
            </p>
          </section>
        )}

        {/* STEP: READY */}
        {step === "ready" && (
          <section className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-centro-primary">
                Ready to start screening
              </h1>
              <p className="text-sm text-centro-ink/70 leading-relaxed">
                Your identity has been verified and your profile is loaded. When you click <strong>Start screening now</strong>, you will connect to Maya, our AI recruiter, for a voice conversation.
              </p>
            </div>

            {/* Display discrepancy alert if any */}
            {cvResult?.discrepancyFlag && (
              <div className="p-4 rounded-lg bg-amber-50 border-2 border-amber-300 text-sm text-amber-900">
                <strong className="text-amber-950 block mb-1">⚠ Name Discrepancy Flagged</strong>
                The name on your CV (<strong>"{cvResult.parsed.fullName}"</strong>) does not match the name on your official ID (<strong>"{result?.idInfo?.idNameEnglish || candidateName}"</strong>) with high confidence (similarity: {cvResult.nameSimilarity.toFixed(0)}%). This has been flagged for manual recruiter audit, but you may still proceed.
              </div>
            )}

            {/* Locked Dimmed fields from ID Card */}
            {renderExtractedInfo()}

            {/* Dimmed parsed CV Details Card */}
            {cvResult && (
              <div className="border border-gray-200 bg-gray-50/50 rounded-lg p-5">
                <h3 className="text-xs font-bold text-centro-primary mb-3 uppercase tracking-wider">
                  Extracted CV Details (Locked)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
                      CV Full Name
                    </label>
                    <input
                      type="text"
                      disabled
                      value={cvResult.parsed.fullName}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded bg-gray-100/80 text-centro-ink/65 cursor-not-allowed font-semibold text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
                      CV Email Address
                    </label>
                    <input
                      type="text"
                      disabled
                      value={cvResult.parsed.email}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded bg-gray-100/80 text-centro-ink/65 cursor-not-allowed text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
                      CV Phone Number
                    </label>
                    <input
                      type="text"
                      disabled
                      value={cvResult.parsed.phone}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded bg-gray-100/80 text-centro-ink/65 cursor-not-allowed text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
                      CV Languages
                    </label>
                    <input
                      type="text"
                      disabled
                      value={cvResult.parsed.languages.join(", ") || "English, Arabic"}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded bg-gray-100/80 text-centro-ink/65 cursor-not-allowed text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4">
              <button onClick={continueToScreening} className="centro-btn px-8 py-4 text-lg font-bold w-full sm:w-auto shadow-md">
                Start screening now →
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function ProgressDot({
  label,
  active,
  done
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          done
            ? "bg-centro-primary text-white"
            : active
              ? "bg-centro-primary/20 text-centro-primary ring-2 ring-centro-primary/40"
              : "bg-gray-200 text-centro-ink/40"
        }`}
      >
        {done ? "✓" : ""}
      </div>
      <span className="text-[10px] text-centro-ink/65 font-medium">{label}</span>
    </div>
  );
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mimeType });
}
