"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getUserCameraStream } from "@/lib/face-capture";
import { pickSupportedMimeType } from "@/lib/recording";

export type CameraFeedHandle = {
  getVideo: () => HTMLVideoElement | null;
  isActive: () => boolean;
  startRecording: () => boolean;
  stopRecording: () => Promise<Blob | null>;
};

type Props = {
  enabled: boolean;
  onStatusChange: (
    status: "idle" | "requesting" | "active" | "denied" | "error",
    detail?: string
  ) => void;
};

export const CameraFeed = forwardRef<CameraFeedHandle, Props>(function CameraFeed(
  { enabled, onStatusChange },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState(false);

  useImperativeHandle(ref, () => ({
    getVideo: () => videoRef.current,
    isActive: () => active,
    startRecording: () => {
      if (!streamRef.current) return false;
      if (recorderRef.current && recorderRef.current.state !== "inactive") return true;
      try {
        const mimeType = pickSupportedMimeType();
        const rec = new MediaRecorder(streamRef.current, {
          mimeType,
          videoBitsPerSecond: 600_000,
          audioBitsPerSecond: 64_000
        });
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.start(2000); // flush a chunk every 2s — survives unexpected stops
        recorderRef.current = rec;
        setRecording(true);
        return true;
      } catch (err) {
        console.error("CameraFeed: MediaRecorder start failed", err);
        return false;
      }
    },
    stopRecording: () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recorderRef.current;
        if (!rec || rec.state === "inactive") {
          resolve(null);
          return;
        }
        rec.onstop = () => {
          const mimeType = rec.mimeType || "video/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          recorderRef.current = null;
          setRecording(false);
          resolve(blob);
        };
        try {
          rec.stop();
        } catch (err) {
          console.error("CameraFeed: MediaRecorder stop failed", err);
          resolve(null);
        }
      })
  }));

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const start = async () => {
      onStatusChange("requesting");
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
        setActive(true);
        onStatusChange("active");
      } catch (err) {
        const e = err as DOMException;
        if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
          onStatusChange(
            "denied",
            "Camera or microphone permission was denied. The screening will continue in voice-only mode."
          );
        } else {
          onStatusChange("error", e?.message ?? String(err));
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {}
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setActive(false);
      setRecording(false);
    };
  }, [enabled, onStatusChange]);

  return (
    <div className="fixed bottom-6 right-6 z-10 w-44 h-32 rounded-lg overflow-hidden shadow-lg border-2 border-centro-primary/30 bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
      />
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-xs text-center px-2">
          Awaiting<br />camera...
        </div>
      )}
      {active && (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          {recording && (
            <span className="text-[10px] text-white/90 font-medium bg-black/40 rounded px-1.5 py-0.5">
              REC
            </span>
          )}
        </div>
      )}
    </div>
  );
});
