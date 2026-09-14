# CenOps Intelligence Phases

CenOps treats enterprise AI as one continuous operational loop rather than a collection of disconnected chatbot features.

## Product loop

`Observe → Understand → Correlate → Assess Risk → Govern → Recommend → Act → Verify → Learn`

## Response contract

Every AI interaction resolves into a `CenOpsResponse` with a response type and evidence-aware sections:

- Executive summary
- Key findings
- Metrics
- Risks and business impact
- Opportunities
- Recommendations
- What changed
- What requires attention
- Evidence
- Confidence
- Follow-ups

Product and how-to requests can intentionally leave operational sections empty. Operational and investigation requests should populate them only when supported by authorized evidence.

## Evidence rules

1. Tenant facts must come from authorized connected evidence.
2. Product capability comes from CenOps product knowledge and the provider registry.
3. Supported by CenOps is not the same as connected to the tenant.
4. Missing evidence is stated explicitly; it is never replaced with fabricated metrics, trends, owners or timestamps.
5. Department scope is preserved through the existing access-control context.

## Governance boundary

AI may analyze evidence and prepare recommendations. Consequential production changes remain human-approved through the existing governed action path.

CenOps does not claim autonomous retraining or autonomous self-healing. The Learn phase is implemented as a future-compatible feedback, evaluation and knowledge-gap loop.

## UI strategy

The chat remains the primary conversational surface, while structured responses provide the contract for executive cards, risk views, evidence drill-down, approval actions and future verification views. This allows later phases to evolve the presentation without changing the AI conversation API.
