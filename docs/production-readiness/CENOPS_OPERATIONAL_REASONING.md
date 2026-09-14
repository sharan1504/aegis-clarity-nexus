# CenOps Operational Reasoning

This phase turns structured evidence into an explicit operational assessment without allowing the model to invent facts.

## Reasoning chain

`Observe → Understand → Correlate → Assess Risk → Assess Business Impact → Recommend → Verify`

### Observe
Use only authorized live evidence, connected-provider evidence, investigation evidence and CenOps product knowledge.

### Understand
Summarize the material finding or highest-priority risk in direct language.

### Correlate
Use the response's existing findings, metrics, risks and evidence. Correlation must remain inside the caller's department scope.

### Assess risk
Prioritize the lowest numeric risk priority and use severity as a tie-breaker. If no risk is established, do not manufacture one.

### Assess business impact
Use an evidence-backed risk impact, finding detail, or opportunity rationale. If none exists, explicitly state that business impact cannot be established from the available evidence.

### Recommend
Recommendations remain descriptive unless they enter the existing governed approval path. CenOps must not autonomously change production systems.

### Verify
Every recommendation should have a verification expectation. Verification means re-checking the authorized evidence sources after an approved action; it does not claim that the action or verification already occurred.

## Leadership outcome

The resulting assessment is designed for CTOs, operations managers and engineers:

- **Assessment** — what matters now.
- **Business impact** — why leadership should care.
- **Why this assessment** — evidence basis and coverage.
- **Verification plan** — how the outcome should be confirmed.

This phase deliberately does not introduce autonomous self-healing, autonomous retraining, or unapproved production actions.
