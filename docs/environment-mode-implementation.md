# Workspace Environment Mode

Aegis workspace data mode is persisted on `public.tenants.environment_mode` and is always `live` unless an administrator explicitly switches the workspace to `demo`.

- Live: connected customer data only; provider failures remain real errors/empty states.
- Demo: deterministic fixtures are served for product exploration and sales walkthroughs.
- The mode is tenant-scoped and resolved with the cached tenant context on server requests.
- Admin changes clear the tenant-context cache so the new mode applies without logout/login.
- The application shell displays a persistent Demo warning banner while Demo mode is active.

The Approval Center provenance indicator is derived directly from the persisted workspace mode: `● Live · N records` or `● Demo · N records`.
