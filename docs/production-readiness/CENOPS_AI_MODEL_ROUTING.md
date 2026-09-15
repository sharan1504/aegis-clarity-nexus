# CenOps AI Model Routing

CenOps uses a governed model router so high-cost reasoning is reserved for requests that need it.

## Default tiers

| Tier | Default model | Purpose |
| --- | --- | --- |
| Fast | `google/gemini-3.1-flash-lite` | Classification, extraction, summarization and other high-volume work |
| Standard | `google/gemini-3.8-flash` | Copilot, workflow planning, productivity analysis and normal reasoning |
| Complex | `openai/gpt-6-astra` | Deep investigations, root-cause analysis and multi-source/cross-provider correlation |

Gemini 3.8 Flash is the standard CenOps workhorse. Gemini 3.1 Flash-Lite is the cost-sensitive tier. Astra is an escalation tier, not the default.

## Configuration

Optional task-specific environment variables:

- `CENOPS_FAST_MODEL`
- `CENOPS_STANDARD_MODEL`
- `CENOPS_REASONING_MODEL`

Only governed Google Gemini and OpenAI GPT model prefixes are accepted. Unsupported model IDs fall back to the CenOps defaults.

`CENOPS_AI_MODEL` and the legacy `AEGIS_AI_MODEL` remain supported only for an explicit, recognized model ID so existing deployments do not break unexpectedly.

## Automatic escalation

Requests using the normal `reasoning` task are promoted to the complex tier when the user request clearly asks for investigation, root-cause analysis, postmortem/forensic work, deep correlation, or cross-provider/multi-source analysis.

This keeps ordinary Copilot traffic on Gemini while preserving a path to Astra for genuinely difficult investigations.

## Temperature

Astra does not receive a custom temperature because it only accepts its API default. Gemini and other supported non-Astra models continue to receive the configured low-temperature default.
