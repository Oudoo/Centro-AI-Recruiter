// Client-side helpers for capturing webcam frames as base64 JPEGs + camera/mic stream.

export async function getUserCameraStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 360 },
      facingMode: "user",
      frameRate: { ideal: 24 }
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
}

/**
 * Capture a single frame from a <video> element and return its base64-encoded JPEG.
 * The frame is downscaled and JPEG-compressed to keep payload small (~5-10 KB per frame).
 * Returns just the base64 string (no data URL prefix) — Hume's API wants raw base64.
 */
export function captureFrame(video: HTMLVideoElement, opts: {
  maxWidth?: number;
  quality?: number;
} = {}): string | null {
  const { maxWidth = 320, quality = 0.55 } = opts;
  if (!video.videoWidth || !video.videoHeight) return null;

  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const commaIdx = dataUrl.indexOf(",");
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

export type ClientFaceFrame = {
  timeOffsetMs: number;
  base64Jpeg: string;
};
