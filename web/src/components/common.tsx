import { useEffect, useState } from "react";
import type { SurveyPoint } from "../types";

export function QualityBadge({ point }: { point: SurveyPoint }) {
  const mm = Math.round(point.accuracyCm * 10);
  const kind = point.rtkQuality === "Fix" ? "fix" : point.rtkQuality === "Float" ? "float" : "single";
  const label = point.rtkQuality === "Fix" ? "FIX" : point.rtkQuality === "Float" ? "FLT" : point.rtkQuality === "Single" ? "SGL" : "?";
  return (
    <span className={`quality-badge ${kind}`}>
      {label} ±{mm}
    </span>
  );
}

export function PhotoThumb({
  refPath,
  resolve,
  size = 32,
  onClick
}: {
  refPath: string | null;
  resolve: (ref: string) => Promise<string | null>;
  size?: number;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!refPath) return;
    resolve(refPath).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [refPath, resolve]);

  if (!refPath) {
    return <span className="photo-thumb empty" style={{ width: size, height: size }}>—</span>;
  }
  if (!url) {
    return <span className="photo-thumb loading" style={{ width: size, height: size }} />;
  }
  return (
    <img
      className="photo-thumb"
      style={{ width: size, height: size }}
      src={url}
      alt="fotka bodu"
      loading="lazy"
      onClick={onClick}
    />
  );
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "právě teď";
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `před ${days} d`;
  return new Date(timestamp).toLocaleDateString("cs-CZ");
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
