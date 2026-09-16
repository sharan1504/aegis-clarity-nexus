# Help Center extension model

The in-app Help Center is static, typed documentation. Core topics live in `src/lib/help/content.ts`; provider-specific topics live in `src/lib/help/provider-guides.ts` and are merged into the searchable topic index.

## Add a topic

1. Add a `HelpTopic` object or provider-guide builder using the typed section model.
2. Give it a stable kebab-case `id` used by `/help?topic=<id>`.
3. Put it in an existing group or the `Provider setup guides` group.
4. Follow the section pattern: What it is, Contract status, Auth model, Prerequisites, Step-by-step connect, Health & sync, Connected criteria, Capabilities, Governed actions, Common failures / integrity notes for provider guides.
5. Add real related application routes or Help deep links under `relatedRoutes`.
6. Keep provider statements evidence-backed. A provider listed in `PROVIDER_REGISTRY` is not automatically live or production-complete.

## Provider-guide requirements

Every `PROVIDER_REGISTRY` entry must have a stable `provider-<id>` topic. The guide must explicitly classify the provider as:

- `full read/sync contract` when the provider is in `CONTRACT_IMPLEMENTED_PROVIDERS` and the runtime contract is implemented.
- `auth available / contract incomplete` when a real auth implementation exists but the provider is not admitted to the full production contract.
- `catalog only` when there is no verified production authentication path.

Do not copy registry capability flags such as `write` into Help as proof that writes are enabled. Governed external mutations are documented only when a real execution + verification path exists. Today that means GitHub create-issue only.

## Connected-state truth

Help Center wording must stay aligned with `src/lib/integrations/provider-contract.ts`. Connected is evidence-derived and requires all three facts:

1. Credentials are present server-side.
2. The provider health evidence is healthy.
3. A real synchronization succeeds and `lastSuccessfulAt` is populated.

Authentication success by itself must remain described as authentication, not Connected. Health success without sync success is not Connected. A successful sync must remain accompanied by the connector's reconciliation semantics where implemented.

## UI and deep links

`src/routes/_app.help.tsx` renders the searchable Help Center and supports `/help?topic=<id>`. Provider guide IDs are generated as `provider-<id>` from the registry, so links remain stable as long as the provider ID remains stable.

Integrations should link provider cards to `/help?topic=provider-<id>` where the UI has a setup action. Do not make Help the source of runtime provider status; Help documents the current contract and setup behavior.

## Change discipline

When a provider enters or leaves `CONTRACT_IMPLEMENTED_PROVIDERS`, update its provider guide status and the relevant contract/readiness documentation in the same change. If a provider gains a write path, document the full governed lifecycle and verification evidence before describing it as write-enabled.

`HELP_TOPIC_BY_ID` and the provider topic merge are derived automatically; no CMS or database migration is needed.
