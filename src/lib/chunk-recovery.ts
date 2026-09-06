// A new deployment renames the built JS chunks. A tab that is still running the
// previous build then fails on its next lazy route import with
// "Failed to fetch dynamically imported module" and shows a blank screen.
// Recover by reloading once so the tab picks up the current build.

const FLAG = "aegis:chunk-reload";
const PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "failed to load module script",
];

function isStaleChunkError(value: unknown): boolean {
  const message =
    value instanceof Error
      ? `${value.message}`
      : typeof value === "string"
        ? value
        : "";
  const lower = message.toLowerCase();
  return PATTERNS.some((p) => lower.includes(p));
}

export function reloadOnStaleChunk(value: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaleChunkError(value)) return false;
  try {
    if (sessionStorage.getItem(FLAG)) return false;
    sessionStorage.setItem(FLAG, String(Date.now()));
  } catch {
    // sessionStorage unavailable — still attempt a single reload below.
  }
  window.location.reload();
  return true;
}

export function installStaleChunkRecovery(): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    // A successful load means the tab is on the current build again.
    sessionStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }

  const onError = (event: ErrorEvent) => {
    reloadOnStaleChunk(event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reloadOnStaleChunk(event.reason);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
