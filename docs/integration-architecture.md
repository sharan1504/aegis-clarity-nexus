# Aegis Integration Instance Architecture

Integrations are modeled as connection instances rather than provider singletons.

Each tenant may connect multiple instances of the same provider (for example Genesys Production and Genesys Development). Each instance must have its own external identifier, credentials, region/environment metadata, health state, sync state, and audit trail.

The UI should list integration instances with search/filter controls and an Add Integration action. Selecting an instance opens its detail workspace where all configuration, health, sync, verification, and lifecycle actions are scoped to that instance.

Do not impose a hard UI limit on the number of instances. A soft operational recommendation of 3-4 active instances per provider may be shown, while allowing additional instances when required.

Performance requirements:
- Avoid loading every provider's full detail data on the integrations landing page.
- Load instance summaries first and fetch detail/history only when an instance is opened.
- Use stable query keys and cache/invalidate targeted instance queries rather than refreshing the entire integrations page.
- Avoid duplicate requests caused by effects with unstable dependencies.
- Prefer lazy loading for heavy detail surfaces and provider-specific code.
- Preserve tenant/RLS isolation and never mix credentials or records between instances.
