# Read-only production migration audit

## Scope

- Make no code, migration, configuration, or database changes.
- Compare migration versions and names in `supabase/migrations` with `supabase_migrations.schema_migrations` in the connected production database.
- Report repository-only migrations as the exact pending filenames, sorted by migration version and filename.
- Separately flag history anomalies that affect push safety, including duplicate local versions and production-only versions.

## Dry-run and SQL evidence

- Attempt the CLI-supported equivalent of `supabase db push --dry-run --linked` only if the CLI can authenticate non-interactively.
- If authentication is unavailable, report that limitation and derive the execution set by inspecting every repository-only migration.
- Inventory the executable SQL in each pending migration, preserving statement order and identifying schema/data effects.
- Search pending SQL specifically for `DROP`, `TRUNCATE`, and `DELETE` operations involving `public.integrations`, including indirect dynamic SQL where present.
- Quote the relevant `public.integrations` SQL evidence and distinguish row-destructive operations from safe `INSERT`, `UPDATE`, `ALTER`, foreign-key, trigger, view, and read-only references.

## Authentication result

- Report whether the installed CLI can authenticate to project ref `zvvtvhocznuemcshkdla` without prompting or requesting credentials.
- Keep the connected database read-only query result distinct from CLI authentication status; access through the project’s managed database tool does not imply CLI login.

## Deliverable

Provide:
1. Exact pending migration filenames in order.
2. Any repository/production migration-history divergence that could make a push unsafe or ambiguous.
3. Dry-run availability/result, or the exact inspected SQL execution inventory when dry-run cannot run.
4. A definitive answer, with quoted SQL evidence, on whether pending migrations can remove existing rows from `public.integrations`.
5. The non-interactive CLI authentication result.
