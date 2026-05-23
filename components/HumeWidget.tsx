"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceProvider, useVoice } from "@humeai/voice-react";
import { CameraFeed, type CameraFeedHandle } from "./CameraFeed";
import { captureFrame, type ClientFaceFrame } from "@/lib/face-capture";

type Props = {
  accessToken: string;
  configId: string;
  candidateName: string;
  cameraEnabled: boolean;
  onEnd: (data: SessionData, reason: EndReason) => void;
};

export type EndReason =
  | { kind: "user_ended" }
  | { kind: "disconnect"; detail: string }
  | { kind: "error"; detail: string };

export type SessionData = {
  transcript: string;
  messages: Array<{ role: "user" | "assistant"; content: string; receivedAt: number }>;
  prosodyTimeline: Array<{ time: number; emotions: Record<string, number> }>;
  faceFrames: ClientFaceFrame[];
  cameraStatus: "active" | "denied" | "error" | "off";
  durationSec: number;
  recordingBlob: Blob | null;
  recordingMimeType: string | null;
};

const EMPTY_SESSION: SessionData = {
  transcript: "",
  messages: [],
  prosodyTimeline: [],
  faceFrames: [],
  cameraStatus: "off",
  durationSec: 0,
  recordingBlob: null,
  recordingMimeType: null
};

const FRAME_CAPTURE_INTERVAL_MS = 2500; // capture roughly once every 2.5 seconds

function VoiceUI({
  accessToken,
  configId,
  candidateName,
  cameraEnabled,
  onEnd,
  lastError,
  lastClose,
  isAssistantSpeaking
}: {
  accessToken: string;
  configId: string;
  candidateName: string;
  cameraEnabled: boolean;
  onEnd: (data: SessionData, reason: EndReason) => void;
  lastError: string | null;
  lastClose: string | null;
  isAssistantSpeaking: boolean;
}) {
  const { connect, disconnect, status, messages, micFft } = useVoice();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hasBeenConnected, setHasBeenConnected] = useState(false);
  const [userEnded, setUserEnded] = useState(false);
  const [showDropPrompt, setShowDropPrompt] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<
    "idle" | "requesting" | "active" | "denied" | "error"
  >("idle");
  const sessionDataRef = useRef<SessionData>(EMPTY_SESSION);
  const cameraRef = useRef<CameraFeedHandle>(null);

  // Track connected state + tick the elapsed timer
  useEffect(() => {
    if (status.value === "connected") {
      if (!hasBeenConnected) setHasBeenConnected(true);
      if (!startedAt) setStartedAt(Date.now());
    }
    const i = setInterval(() => {
      if (startedAt && status.value === "connected")
        setElapsed((Date.now() - startedAt) / 1000);
    }, 500);
    return () => clearInterval(i);
  }, [status.value, hasBeenConnected, startedAt]);

  // Recovery flow if disconnected after having been connected
  useEffect(() => {
    if (
      hasBeenConnected &&
      !userEnded &&
      (status.value === "disconnected" || status.value === "error")
    ) {
      setShowDropPrompt(true);
    }
  }, [status.value, hasBeenConnected, userEnded]);

  // Frame capture loop — runs while voice is connected AND camera is active
  useEffect(() => {
    if (status.value !== "connected") return;
    if (cameraStatus !== "active") return;
    if (!startedAt) return;

    const interval = setInterval(() => {
      const video = cameraRef.current?.getVideo();
      if (!video) return;
      const base64 = captureFrame(video, { maxWidth: 320, quality: 0.55 });
      if (!base64) return;
      sessionDataRef.current.faceFrames.push({
        timeOffsetMs: Date.now() - startedAt,
        base64Jpeg: base64
      });
    }, FRAME_CAPTURE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status.value, cameraStatus, startedAt]);

  // Start MediaRecorder when both voice + camera are active
  useEffect(() => {
    if (status.value !== "connected") return;
    if (cameraStatus !== "active") return;
    if (!cameraRef.current) return;
    const started = cameraRef.current.startRecording();
    if (!started) console.warn("HumeWidget: MediaRecorder could not start");
  }, [status.value, cameraStatus]);

  // Mirror Hume messages into sessionData
  useEffect(() => {
    const transcriptLines: string[] = [];
    const prosody: SessionData["prosodyTimeline"] = [];
    const allMessages: SessionData["messages"] = [];

    messages.forEach((m) => {
      const anyM = m as any;
      const mtype = anyM.type;
      const content: string | undefined = anyM.message?.content;
      const prosodyScores: Record<string, number> | undefined =
        anyM.models?.prosody?.scores;
      const receivedAtRaw = anyM.receivedAt;
      const receivedAt =
        receivedAtRaw instanceof Date
          ? receivedAtRaw.getTime()
          : typeof receivedAtRaw === "number"
            ? receivedAtRaw
            : Date.now();

      if (mtype === "user_message" && content) {
        transcriptLines.push(`CANDIDATE: ${content}`);
        allMessages.push({ role: "user", content, receivedAt });
      } else if (mtype === "assistant_message" && content) {
        transcriptLines.push(`MAYA: ${content}`);
        allMessages.push({ role: "assistant", content, receivedAt });
      }

      if (prosodyScores && mtype === "user_message") {
        prosody.push({ time: receivedAt, emotions: prosodyScores });
      }
    });

    // Preserve faceFrames (mutated separately above) across this update
    sessionDataRef.current = {
      ...sessionDataRef.current,
      transcript: transcriptLines.join("\n"),
      messages: allMessages,
      prosodyTimeline: prosody,
      durationSec: elapsed,
      cameraStatus:
        cameraStatus === "active"
          ? "active"
          : cameraStatus === "denied"
            ? "denied"
            : cameraStatus === "error"
              ? "error"
              : "off"
    };
  }, [messages, elapsed, cameraStatus]);

  const handleStart = async () => {
    setShowDropPrompt(false);
    setUserEnded(false);
    sessionDataRef.current = { ...EMPTY_SESSION, faceFrames: [] };
    try {
      await connect({
        auth: { type: "accessToken", value: accessToken },
        configId,
        sessionSettings: {
          type: "session_settings",
          systemPrompt: `You are Maya, an AI BPO screening interviewer for Centro CDX.
The candidate's official translated ID name is "${candidateName}".
At the very beginning of the screening, greet the candidate by saying EXACTLY: "Hello ${candidateName}, I have your official details. Is there a preferred name you'd like me to use during our screening?"
Once they tell you their preferred name, note it, call them by that preferred name for the rest of the conversation, and then proceed with the BPO Customer Service screening. Evaluate their baseline English proficiency, fluency, composure, eq, and confidence.`
        }
      });
    } catch (err) {
      console.error("Hume connect failed:", err);
      alert(
        `Could not start the screening session.\n\n${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const finalizeRecording = async (): Promise<{
    blob: Blob | null;
    mimeType: string | null;
  }> => {
    if (!cameraRef.current) return { blob: null, mimeType: null };
    const blob = await cameraRef.current.stopRecording();
    return { blob, mimeType: blob?.type ?? null };
  };

  const handleUserEnd = async () => {
    // Snapshot the transcript + messages BEFORE disconnecting. Hume's voice context
    // can clear its messages array on disconnect (race against our useEffect that
    // mirrors them into sessionDataRef), which was producing empty transcripts in
    // 2-minute sessions. We also disable clearMessagesOnDisconnect on VoiceProvider
    // below — this snapshot is belt + suspenders.
    const snapshot: SessionData = {
      ...sessionDataRef.current,
      faceFrames: [...sessionDataRef.current.faceFrames]
    };
    setUserEnded(true);
    disconnect();
    const { blob, mimeType } = await finalizeRecording();
    snapshot.recordingBlob = blob;
    snapshot.recordingMimeType = mimeType;
    onEnd(snapshot, { kind: "user_ended" });
  };

  const handleScorePartial = async () => {
    const snapshot: SessionData = {
      ...sessionDataRef.current,
      faceFrames: [...sessionDataRef.current.faceFrames]
    };
    const reason: EndReason = lastError
      ? { kind: "error", detail: lastError }
      : { kind: "disconnect", detail: lastClose ?? "Connection dropped" };
    const { blob, mimeType } = await finalizeRecording();
    snapshot.recordingBlob = blob;
    snapshot.recordingMimeType = mimeType;
    onEnd(snapshot, reason);
  };

  const handleCameraStatusChange = useCallback(
    (
      next: "idle" | "requesting" | "active" | "denied" | "error",
      _detail?: string
    ) => {
      setCameraStatus(next);
    },
    []
  );

  const fftLevel = micFft ? Math.max(...micFft) / 50 : 0;

  if (showDropPrompt) {
    const hasTranscript = sessionDataRef.current.transcript.length > 20;
    return (
      <div className="flex flex-col items-center gap-6 py-12 max-w-xl mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-3xl">
          !
        </div>
        <h2 className="text-2xl font-semibold text-centro-ink">Connection dropped</h2>
        <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-left text-amber-900 w-full">
          <p className="font-semibold mb-1">Reason:</p>
          <p className="font-mono text-xs">{lastError ?? lastClose ?? "Unknown"}</p>
          <p className="mt-3 text-xs opacity-80">
            Most common cause: brief network instability. Check your wifi or switch to a
            wired/4G connection and try again.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          {hasTranscript && (
            <button onClick={handleScorePartial} className="centro-btn">
              Score what we have ({sessionDataRef.current.messages.length} turns ·{" "}
              {sessionDataRef.current.faceFrames.length} face frames)
            </button>
          )}
          <button
            onClick={handleStart}
            className="rounded-md border-2 border-centro-primary text-centro-primary px-6 py-3 font-medium hover:bg-centro-primary/5"
          >
            Try again
          </button>
        </div>
        {!hasTranscript && (
          <p className="text-xs text-centro-ink/60">
            No usable speech was captured before the drop, so there's nothing to score.
            Please retry.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      {cameraEnabled && status.value === "connected" && (
        <CameraFeed
          ref={cameraRef}
          enabled={status.value === "connected"}
          onStatusChange={handleCameraStatusChange}
        />
      )}

      <div className="text-center">
        <p className="text-sm uppercase tracking-widest opacity-60">Candidate</p>
        <p className="text-xl font-medium mt-1">{candidateName}</p>
      </div>

      <div className="relative w-56 h-56 flex items-center justify-center">
        <div
          className={`absolute inset-0 rounded-full transition-transform duration-150 ${
            isAssistantSpeaking ? "bg-centro-primary/25" : "bg-centro-primary/10"
          }`}
          style={{
            transform: `scale(${1 + (isAssistantSpeaking ? 0.18 : fftLevel * 0.5)})`
          }}
        />
        <div
          className={`absolute inset-4 rounded-full transition-transform duration-200 ${
            isAssistantSpeaking ? "bg-centro-primary/40" : "bg-centro-primary/20"
          }`}
          style={{
            transform: `scale(${1 + (isAssistantSpeaking ? 0.1 : fftLevel * 0.3)})`
          }}
        />
        <div className="relative w-32 h-32 rounded-full bg-centro-primary flex items-center justify-center text-centro-paper text-3xl font-bold">
          Maya
        </div>
      </div>

      <div className="text-center min-h-[3rem]">
        {status.value === "connected" && isAssistantSpeaking && (
          <p className="text-centro-primary font-medium">
            Maya is speaking · {Math.floor(elapsed)}s
          </p>
        )}
        {status.value === "connected" && !isAssistantSpeaking && (
          <p className="text-centro-primary font-medium">
            Listening · your turn · {Math.floor(elapsed)}s
          </p>
        )}
        {status.value === "connected" && cameraStatus === "denied" && (
          <p className="text-xs text-amber-700 mt-1">
            Voice-only mode (camera not granted)
          </p>
        )}
        {status.value === "disconnected" && !hasBeenConnected && (
          <p className="text-centro-ink/60">Tap below to start your screening</p>
        )}
        {status.value === "connecting" && (
          <p className="text-amber-600 font-medium">Connecting...</p>
        )}
      </div>

      <div className="flex gap-3">
        {status.value !== "connected" ? (
          <button
            onClick={handleStart}
            disabled={status.value === "connecting"}
            className="centro-btn"
          >
            Start Screening
          </button>
        ) : (
          <button
            onClick={handleUserEnd}
            className="rounded-md border-2 border-centro-primary text-centro-primary px-6 py-3 font-medium hover:bg-centro-primary/5"
          >
            End Session
          </button>
        )}
      </div>
    </div>
  );
}

export function HumeWidget({
  accessToken,
  configId,
  candidateName,
  cameraEnabled,
  onEnd
}: Props) {
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastClose, setLastClose] = useState<string | null>(null);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const audioClipsRef = useRef<Set<string>>(new Set());

  return (
    <VoiceProvider
      clearMessagesOnDisconnect={false}
      onError={(err) => {
        const detail = `${err.type ?? "error"}: ${err.message ?? "no message"}`;
        console.error("Hume voice error:", err);
        setLastError(detail);
      }}
      onClose={(event) => {
        const detail = `WebSocket closed (code ${event?.code ?? "?"}): ${
          event?.reason ?? "no reason given"
        }`;
        console.warn("Hume voice closed:", event);
        setLastClose(detail);
      }}
      onAudioStart={(clipId) => {
        audioClipsRef.current.add(clipId);
        setIsAssistantSpeaking(true);
      }}
      onAudioEnd={(clipId) => {
        audioClipsRef.current.delete(clipId);
        if (audioClipsRef.current.size === 0) setIsAssistantSpeaking(false);
      }}
      onInterruption={() => {
        audioClipsRef.current.clear();
        setIsAssistantSpeaking(false);
      }}
    >
      <VoiceUI
        accessToken={accessToken}
        configId={configId}
        candidateName={candidateName}
        cameraEnabled={cameraEnabled}
        onEnd={onEnd}
        lastError={lastError}
        lastClose={lastClose}
        isAssistantSpeaking={isAssistantSpeaking}
      />
    </VoiceProvider>
  );
}
