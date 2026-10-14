# Audit-chain verification and independent anchoring

## Database integrity

Migration `20261014130000_audit_chain_verification_anchor.sql` assigns every historical row a per-tenant sequence and keeps legacy hashes tagged as version 1. New rows use hash version 2: inserts are serialized per tenant, sequence allocation is monotonic, and the canonical SHA-256 input includes actor identity/role/email, action, entity, detail, payload, sequence, tenant, and timestamp.

Run the database function `select public.verify_audit_chain('<tenant-uuid>');` as a tenant member or service role to check sequence continuity, predecessor links, and row hashes. The function returns the number checked, first invalid sequence, and observed head.

## Independent anchoring contract

The database queues an anchor checkpoint every 100 audit events and supports explicitly queueing the current head with `public.request_audit_chain_anchor(tenant_uuid)`. A separate external service must store the checkpoint independently of the CenOps/Supabase database.

Configure these server-only environment variables:

- `AUDIT_ANCHOR_URL`: HTTPS endpoint controlled by the independent anchor service. It must accept a JSON POST and return JSON.
- `AUDIT_ANCHOR_HMAC_SECRET`: random secret of at least 32 characters, shared with the anchor service.
- `AUDIT_ANCHOR_WORKER_SECRET`: separate secret used to authenticate the internal delivery route.

The worker route is `POST /api/internal/audit-anchor` and requires `Authorization: Bearer <AUDIT_ANCHOR_WORKER_SECRET>` plus `x-aegis-job-worker: pg-boss`. Schedule the existing job runner or an external scheduler to call this route. The worker signs the exact JSON body with HMAC-SHA256 in `x-cenops-signature: sha256=<hex>`. The receiver must durably retain the tenant, sequence, head hash, and receipt outside the primary database, and return `{ "anchorId": "...", "headHash": "<same hash>" }`.

A checkpoint is **not independently anchored** until the outbox row reaches `anchored` with a matching external receipt. Missing endpoint configuration is a deployment gap, not a successful anchor. The external receiver's availability and retention must be tested separately.
