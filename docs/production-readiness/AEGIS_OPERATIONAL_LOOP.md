# Aegis AI operational loop

Aegis is organized around a governed operational loop rather than isolated AI features:

```text
Detection → Investigation → Recommendation → Guardrail → Approval → Execution → Verification → Audit → Outcome
```

## Current implementation

### Detection
Live provider reads, persisted provider syncs, analytics telemetry and audit/change records provide the evidence used by the Command Center and Analytics workspace. Aegis does not create synthetic findings when no evidence exists.

### Investigation
`/investigations` turns a real recommendation into an evidence-backed investigation. It shows the finding, source evidence, persisted sync freshness, related change records and relevant audit timeline entries. Correlations are only shown when persisted records have an explicit relationship; the current first version does not claim broad semantic correlation across arbitrary providers.

### Recommendation
Recommendations originate from existing provider/workspace analysis. The investigation view exposes the recommended action without treating it as an approval or execution decision.

### Guardrail
The existing guardrail/evaluation and execution gateway remain the enforcement boundary. The new investigation UI does not create a bypass path.

### Approval
The existing Approval Center and change-record pipeline remain the human authorization boundary. Investigation links into that workflow rather than implementing a second approval system.

### Execution
Provider mutations, where supported, continue through the existing connector and governed execution paths. The investigation surface itself cannot execute a provider mutation.

### Verification
Verification is provider-specific and remains dependent on the existing connector/action implementation. The investigation UI does not claim that an action has been verified merely because an approval exists.

### Audit
The existing append-only, hash-chained audit system records governed actions and related events. Command Center and Investigations read this evidence; they do not create a parallel audit source.

### Outcome
Business outcomes such as estimated savings are displayed only when an evidence-backed estimate is persisted. Otherwise Aegis explicitly displays `Not estimated` rather than inventing a value.

## Product surfaces

- **Command Center** — operational attention, risk, posture, recent changes and audit signals.
- **Analytics** — measurement, filtering, segments, reporting and exports.
- **Investigations** — evidence-backed operational findings and traceable context.
- **AI Agents** — real tenant agent definitions, bindings, telemetry, changes and outcomes.
- **Chat Assistant** — natural-language investigation and recommendation entry point.
- **Approval Center** — human governance for proposed changes.
- **Integrations** — provider connection and synchronization state.
- **Guardrails / Settings / Audit** — policy, administration and evidence controls.

## Integrity rules

1. No seeded or fabricated business data is presented as tenant data.
2. Provider reads and writes remain server-authorized and tenant-scoped.
3. Recommendations do not imply execution or approval.
4. Correlations require underlying evidence.
5. Missing estimates are shown as unavailable/not estimated rather than guessed.
6. The audit chain remains append-only.
