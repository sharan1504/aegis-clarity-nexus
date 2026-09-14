/**
 * Shared configuration for the Lovable AI Gateway.
 * The model can be changed without editing multiple server functions.
 */
export const LOVABLE_AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const LOVABLE_AI_MODEL = process.env.AEGIS_AI_MODEL ?? "google/gemini-2.5-flash";

export function describeAiGatewayError(status: number, body: string, model: string): string {
  const detail = body.trim().replace(/\s+/g, " ").slice(0, 800);
  if (status === 402) return `AI request failed (402): AI credits or billing are unavailable for this workspace. Model=${model}.`;
  if (status === 401 || status === 403) return `AI request failed (${status}): the Lovable AI credential was rejected or is not authorized. Model=${model}.`;
  if (status === 429) return `AI request failed (429): the AI gateway rate-limited the request. Model=${model}.`;
  return detail
    ? `AI request failed (${status}) for model ${model}: ${detail}`
    : `AI request failed (${status}) for model ${model}: the gateway returned no diagnostic body.`;
}
