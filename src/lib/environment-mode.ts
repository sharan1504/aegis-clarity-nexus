export type EnvironmentMode = "live" | "demo";

export function isDemoMode(environmentMode: EnvironmentMode): boolean {
  return environmentMode === "demo";
}
