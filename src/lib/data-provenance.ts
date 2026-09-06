export type DataProvenance = "demo" | "live" | "mixed" | "offline";

export function classifyDataProvenance(options: {
  demoFlags: boolean[];
  connected?: boolean;
}): DataProvenance {
  const { demoFlags, connected = false } = options;
  if (!demoFlags.length) return connected ? "live" : "offline";
  const hasDemo = demoFlags.some(Boolean);
  const hasLive = demoFlags.some((flag) => !flag);
  if (hasDemo && hasLive) return "mixed";
  return hasDemo ? "demo" : connected ? "live" : "offline";
}

export function dataProvenanceLabel(provenance: DataProvenance): string {
  switch (provenance) {
    case "demo": return "Demo";
    case "mixed": return "Mixed";
    case "live": return "Live";
    default: return "Offline";
  }
}
