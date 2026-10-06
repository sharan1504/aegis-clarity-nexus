export function formatUntrustedEvidence(label: string, value: unknown): string {
  const serialized = JSON.stringify(value ?? null).replace(/=====\s*(BEGIN|END)\s+/gi, "\\u003d\\u003d\\u003d\\u003d\\u003d $1 ");
  return `===== BEGIN UNTRUSTED ${label} =====\n${serialized}\n===== END UNTRUSTED ${label} =====`;
}
