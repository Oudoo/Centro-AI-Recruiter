"use client";

import { useEffect, useState } from "react";

type Quality = "offline" | "poor" | "fair" | "good";

function qualityFromLatency(ms: number | null, online: boolean): Quality {
  if (!online) return "offline";
  if (ms === null) return "fair";
  if (ms < 150) return "good";
  if (ms < 400) return "fair";
  return "poor";
}

const labels: Record<Quality, string> = {
  offline: "Offline",
  poor: "Weak connection",
  fair: "OK",
  good: "Stable"
};

const colors: Record<Quality, string> = {
  offline: "bg-rose-500",
  poor: "bg-amber-500",
  fair: "bg-sky-500",
  good: "bg-emerald-500"
};

export function NetworkStatus({ pingIntervalMs = 5000 }: { pingIntervalMs?: number }) {
  const [online, setOnline] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const goOn = () => setOnline(true);
    const goOff = () => setOnline(false);
    window.addEventListener("online", goOn);
    window.addEventListener("offline", goOff);
    return () => {
      window.removeEventListener("online", goOn);
      window.removeEventListener("offline", goOff);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const ping = async () => {
      const start = performance.now();
      try {
        await fetch("/api/ping", { method: "GET", cache: "no-store" });
        if (!cancelled) setLatencyMs(Math.round(performance.now() - start));
      } catch {
        if (!cancelled) setLatencyMs(null);
      }
      if (!cancelled) timer = setTimeout(ping, pingIntervalMs);
    };
    void ping();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pingIntervalMs]);

  const quality = qualityFromLatency(latencyMs, online);

  // Render 4 bars, fill based on quality
  const filled =
    quality === "good" ? 4 : quality === "fair" ? 3 : quality === "poor" ? 2 : 0;

  return (
    <div className="flex items-center gap-2 text-xs text-centro-ink/70">
      <div className="flex items-end gap-0.5 h-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`w-1 rounded-sm transition-colors ${
              i <= filled ? colors[quality] : "bg-gray-200"
            }`}
            style={{ height: `${i * 25}%` }}
          />
        ))}
      </div>
      <span className="font-medium">
        {labels[quality]}
        {latencyMs !== null && online && (
          <span className="ml-1 opacity-60">· {latencyMs}ms</span>
        )}
      </span>
    </div>
  );
}
