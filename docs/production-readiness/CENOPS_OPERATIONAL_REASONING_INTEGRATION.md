# Reasoning panel integration

`CenOpsReasoningPanel` consumes the existing `CenOpsResponse` contract and derives:

- priority
- operational assessment
- evidence-backed business impact
- assessment rationale
- verification plan

It is intentionally decoupled from the chat API so the rich response UI can adopt it without changing persisted message contracts.
