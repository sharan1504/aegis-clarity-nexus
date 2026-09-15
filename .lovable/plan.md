# Phase 1 AWS IAM role integration

## Scope
Implement only the AWS provider changes from the audit. Jira, Salesforce, ServiceNow, Slack, Genesys, GitHub, and all unrelated platform behavior remain unchanged.

## Branch constraint
The current managed workspace reports branch `edit/edt-63c703ad-bb97-478d-b20a-44091278fdf5`, not `fix/provider-integrations`. I will not switch, merge, or edit `main`; Lovable manages Git state and will record this work as a focused edit. If the exact Git branch name is mandatory outside Lovable’s managed edit branch, that branch must be selected before implementation.

## Implementation
1. Add `@aws-sdk/client-sts` version `3.1131.0` only.
2. Replace the AWS static-key validator with STS role assumption using the server credential chain and exactly `RoleArn`, `RoleSessionName`, `ExternalId`, and `DurationSeconds: 900`.
3. Add an Admin/Manager-protected AWS setup function that:
   - creates or reuses the tenant-scoped AWS connection,
   - generates a cryptographically secure external ID for new connections,
   - preserves the encrypted external ID during reconfiguration,
   - resolves the CenOps AWS account using `GetCallerIdentity`,
   - returns only connection ID, external ID, and the exact least-trust AWS policy metadata.
4. Restrict AWS credential persistence to `{ roleArn, externalId }`; never return or persist temporary credentials.
5. Update the AWS connection UI to show read-only External ID, copyable trust-policy JSON, concise IAM setup steps, and Role ARN only.
6. Keep the provider connection’s external account identifier separate from the CenOps-generated external ID.

## Tests and verification
- Add focused mocked AWS SDK tests for input shape, AssumeRole parameters, temporary-credential non-disclosure, external-ID uniqueness/preservation, and exact trust policy.
- Run focused tests, the full test command, lint, TypeScript checking, and production build.
- Report any pre-existing failures separately and do not repair unrelated issues.

## Commit boundary
Keep all changes in one focused managed edit titled `fix(integrations): replace AWS static keys with role assumption`; do not merge branches.
