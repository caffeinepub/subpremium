export type QualityPreference = "auto" | "higher" | "datasaver";
export type NetworkType = "wifi" | "mobile" | "unknown";

export function detectNetworkType(): NetworkType {
  const conn =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;
  if (!conn) return "unknown";
  const type = conn.type;
  if (type === "wifi" || type === "ethernet") return "wifi";
  if (type === "cellular" || type === "2g" || type === "3g" || type === "4g")
    return "mobile";
  // effectiveType fallback
  const eff = conn.effectiveType;
  if (eff === "4g") return "wifi";
  if (eff === "3g" || eff === "2g" || eff === "slow-2g") return "mobile";
  return "unknown";
}

// Maps quality preference + available sources to a concrete source URL
export function resolveQualityUrl(
  preference: QualityPreference,
  sources: Array<{ quality: string; url: string }>,
): string | null {
  if (!sources || sources.length === 0) return null;

  const resolutions = ["1080p", "720p", "480p", "360p"];

  if (preference === "higher") {
    for (const res of resolutions) {
      const src = sources.find((s) => s.quality === res);
      if (src) return src.url;
    }
    return sources[0].url;
  }

  if (preference === "datasaver") {
    for (const res of [...resolutions].reverse()) {
      const src = sources.find((s) => s.quality === res);
      if (src) return src.url;
    }
    return sources[sources.length - 1].url;
  }

  // auto: return null (let existing auto logic handle it)
  return null;
}
