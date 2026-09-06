# ESLint 10 migration

Aegis upgrades ESLint and the official React Hooks plugin together because `eslint-plugin-react-hooks@5.2.0` does not declare ESLint 10 support. `eslint-plugin-react-hooks@7.1.1` adds ESLint 10 support.

The CI workflow refreshes `package-lock.json`, installs with `npm ci`, then runs lint, tests, and the production build.
