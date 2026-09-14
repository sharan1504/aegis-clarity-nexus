# CenOps Operational Reasoning Phase

This phase adds an evidence-grounded reasoning layer on top of the structured CenOps response.

`Observe → Understand → Correlate → Assess Risk → Assess Business Impact → Recommend → Verify`

The reasoning engine prioritizes the highest-ranked supported risk, falls back to the most material supported finding, and never manufactures a risk when only opportunities are present.

It derives business impact only from existing response evidence. If impact cannot be established, CenOps says so explicitly.

Recommendations remain governed. Verification is represented as a plan to re-check authorized evidence after an approved action; it does not claim that an action has already happened.

The new reasoning panel is additive and consumes the existing `CenOpsResponse` contract, allowing it to be attached to the rich response renderer without changing the chat API.

No autonomous production actions, autonomous self-healing, or autonomous retraining are introduced.
