# Aegis AI public website and controlled platform access

## Goal
Create a public, static-first Aegis AI marketing website at `/`, move the existing secured product under `/platform`, and replace public self-service platform entry with an administrator-reviewed access request.

Confirmed choices:
- Public website: `cenops.in/`
- Secured product: `cenops.in/platform`
- Access requests: administrator review before access
- Follow-up: store each request and notify the administrator by email
- Existing administrator: `sshrinivasan97@gmail.com` remains an Admin with full product access

## Public website
- Build a responsive homepage with alternating near-black/navy and white sections, authoritative serif display typography, clean sans-serif body typography, and one restrained teal trust accent.
- Include the requested sections: positioning-led hero, provider-category trust bar, governance problems, six-stage operating pipeline, shipped capability grid, market context, fair differentiation, security architecture, design-partner CTA, and footer.
- Use only technically supported claims from the existing Aegis product and documentation. Do not invent customers, testimonials, statistics, press, or roadmap capabilities.
- Use accessible semantic structure, keyboard-friendly controls, WCAG-conscious contrast, reduced-motion support, and static content for fast first render.
- Add unique homepage metadata, canonical URL, social metadata, and a public-only sitemap.

## Platform separation
- Move the existing authenticated route tree from `/` and sibling product paths to `/platform` and `/platform/*` without redesigning product screens.
- Update product navigation, deep links, redirects, callbacks, breadcrumbs, metadata, and notification links to the new paths.
- Keep `/auth` as the dedicated administrator/approved-user sign-in page, reached from a clear “Platform sign in” link rather than shown as the public first screen.
- After successful sign-in or password change, send approved users to `/platform`.
- Keep every product page protected by the existing session and role checks.

## Access request and approval
- Add a public request-access form with name, work email, company, role/title, and a short use-case field.
- Store requests with a review status and timestamps. Public visitors may submit only; they cannot read or edit requests.
- Add an Admin-only review surface inside the platform where administrators can review, approve, or reject requests.
- Approval will not silently grant an arbitrary tenant or role. It will create/invite access through the existing controlled user-management path and default new users to the least-privileged Viewer role unless an administrator explicitly selects another permitted role.
- Show clear submitted, duplicate, validation, rate-limit, approved, and rejected states.

## Email notification
- Use Lovable’s managed app email service to notify `sshrinivasan97@gmail.com` after a request is stored, with an idempotent one-recipient notification.
- Do not add an email queue or expose recipient selection to the browser.
- Email sending requires a sender domain owned by the project. No sender domain is configured yet; the website and stored request flow can be completed, but notifications begin only after the sender domain is configured and verified.

## Security hardening
- Correct the two active access-control findings before completion:
  - Prevent users from moving their profile into another tenant except through a verified invite/claim path.
  - Prevent self-service assignment of Admin or arbitrary tenant roles; permit only controlled first-tenant bootstrap and administrator-managed role changes.
- Preserve tenant isolation, server-side role verification, separate role storage, auditability, and deny-by-default access.
- Record access-request review actions in the existing audit trail.

## Verification
- Test public and secured routing, sign-in redirects, deep links, mobile/desktop layouts, form validation, administrator-only review, approval/rejection behavior, and the retained Admin access for `sshrinivasan97@gmail.com`.
- Run focused tests plus the project lint, full test suite, and production build; report any unrelated existing failures separately.
- Verify the rendered public homepage and secured `/platform` flow in the browser at desktop and mobile sizes.

## Deployment boundary
This work will prepare `cenops.in/` and `/platform`, but will not publish or change domain wiring until you explicitly ask to deploy.
