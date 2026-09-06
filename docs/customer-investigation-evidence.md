# Customer Investigation & Resolution Evidence

Aegis treats every customer-facing AI interaction as an auditable investigation when the channel runtime opts into the evidence contract.

## Correlation chain

`tenant → channel → customer → conversation → interaction → investigation → tool invocation → evidence/finding → action → verification → customer response`

Supported channel values:

- `voice`
- `chat`
- `messaging`
- `whatsapp`
- `email`
- `bot`
- `api`

The database contract is channel-neutral. Enterprise Chat is the first wired runtime; other channel runtimes should use the same server helpers rather than creating channel-specific evidence tables.

## What is recorded

For every investigation:

1. customer/channel/conversation/interaction correlation
2. investigation status and intent
3. ordered investigation steps
4. every authorized tool call
5. provider, MCP/server name and exact tool name
6. sanitized tool arguments
7. sanitized tool result/evidence
8. authorization context and tenant boundary
9. start/completion timestamps and latency
10. failures as first-class tool invocations
11. finding/decision/action/verification steps
12. the customer-facing resolution response

Secrets are never persisted as raw evidence. The existing Aegis output sanitizer masks credential fields and secret-shaped values before tool arguments/results enter the investigation record.

## Channel adapter pattern

A channel runtime should:

```text
startCustomerInvestigation({ channel, customerId, conversationId, interactionId })
        ↓
runRecordedTool(..., () => providerOrMcpTool(...))   [repeat for every tool]
        ↓
recordInvestigationStep(finding / decision / action / verification)
        ↓
completeCustomerInvestigation({ responseText, verification })
```

A failed tool is recorded with `status=failed` and the investigation is closed as `failed` or `needs_human`; failures must not disappear into application logs only.

## Customer response rule

The response shown to the customer can remain concise. The evidence trail is the internal source of truth and must answer:

- What did the customer ask?
- Which systems/tools were called?
- What exactly was sent to each tool?
- What did each tool return?
- What evidence supported the finding?
- What action was taken or recommended?
- Was the outcome verified?
- What did Aegis tell the customer?

Read-only investigations do not claim that a remediation was completed. Provider mutations remain subject to the existing approval/execution gateway.
