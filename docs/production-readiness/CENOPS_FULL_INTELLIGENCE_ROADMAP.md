# CenOps Full Intelligence Roadmap

This release turns the existing Copilot response contract into a reusable enterprise operating model without requiring a new provider connection or an autonomous production action.

## Phase coverage

1. **Copilot foundation** — structured executive-first responses, product knowledge, evidence and governed recommendations remain the base contract.
2. **Investigation intelligence** — responses now expose a decision-brief surface and a governed operating loop: Observe, Understand, Correlate, Detect risk, Assess impact, Recommend, Approval, Verify and Learn. Timestamped evidence is surfaced as a timeline when supplied.
3. **Real integrations** — the existing provider registry and integration management remain the source of truth. The response layer distinguishes provider capability from tenant evidence and does not fabricate connection state.
4. **Operational agents** — the existing agent catalog/detail/workflow surfaces remain the agent system of record. Copilot recommendations can route to governed change/approval flows.
5. **Executive intelligence** — the decision brief provides Executive, Operations and Technical lenses over the same response, keeping one evidence model while changing presentation for the audience.
6. **Command center** — the existing command-center/dashboard/report surfaces remain the enterprise overview; Copilot responses use the same structured findings/risk/recommendation vocabulary.
7. **Governed autonomous operations** — the operating loop explicitly stops at human approval before consequential actions and includes verification after an approved action. No autonomous production mutation is introduced by this release.
8. **Continuous learning & evaluation** — the Learn stage represents feedback/evaluation readiness. It does not imply autonomous retraining or self-healing.

## Evidence rules

- Never infer a root cause merely because a finding exists.
- Timeline entries are rendered only when evidence includes timestamps.
- Affected systems are derived only from supplied evidence sources unless an explicit operational context is provided by the model.
- Correlations and root-cause hypotheses remain empty unless the response contains explicit, normalized evidence for them.
- Confidence reflects evidence quality, not hidden model confidence.
- Production-changing recommendations remain approval-gated.

## Next backend evolution

The next backend iteration can populate `operationalContext` from the existing provider correlation engine and investigation records. This keeps the UI contract stable while progressively replacing derived presentation with stronger evidence-backed correlations, root-cause hypotheses and post-change verification telemetry.
