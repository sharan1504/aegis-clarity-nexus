# Help Center extension model

The in-app Help Center is static, typed documentation in `src/lib/help/content.ts`.

## Add a topic

1. Add a `HelpTopic` object to `HELP_TOPICS`.
2. Give it a stable kebab-case `id` used by `/help?topic=<id>`.
3. Put it in one of the existing `group` values.
4. Follow the section pattern: What it is, Use cases, How it works, Prerequisites, Step-by-step, Configuration options, Common mistakes / integrity notes.
5. Add real related application routes under `relatedRoutes`.
6. Keep provider statements evidence-backed. A provider listed in the registry is not automatically live or production-complete.

`HELP_TOPIC_BY_ID` and `HELP_GROUPS` are derived automatically; no CMS or database migration is needed.

## UI

`src/routes/_app.help.tsx` renders the searchable left navigation and selected topic. The page is authenticated by the existing `/_app` route guard and is deep-linkable through the `topic` search parameter.

The header entry lives in `src/components/layout/AppLayout.tsx` and points to `/help`.
