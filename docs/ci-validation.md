Environment-mode validation checklist:

1. `npm run lint`
2. `npm test`
3. `npm run build`
4. Live tenant with no integrations: verify real empty states on Chat, Vulnerabilities, Approval Center, Command Center, Analytics and Audit.
5. Demo tenant: verify deterministic fixtures and Demo provenance labels.
6. Switch Live/Demo as admin and verify all open sessions pick up the persisted workspace mode.
