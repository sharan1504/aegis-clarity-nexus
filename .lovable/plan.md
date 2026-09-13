# Aegis AI public website and platform entry

## Goal
Turn `/` into a polished public Aegis AI website while preserving the operational platform as a separate authenticated experience. Visitors can request access; existing authorized users can sign in and open the platform.

## Assumptions
- Keep deployment and domain wiring unchanged for now, as requested. The final site will be ready for either `cenops.in` or `www.cenops.in` once confirmed.
- Use a reviewed access-request flow rather than automatically granting workspace access to every form submission.
- Keep `sshrinivasan97@gmail.com` as a full Admin. The live backend already confirms this account has the Admin role.

## Public website
- Move the current authenticated Command Center from `/` to `/dashboard` without changing its functionality.
- Build a new public homepage at `/` with its own navigation, mobile menu, and distinct light/dark section rhythm.
- Use authoritative serif display typography, clean sans-serif body typography, near-black/navy/white surfaces, and one restrained teal trust accent.
- Create a purpose-built product visual showing the evidence-to-audit operating loop; avoid decorative gradients, fake screenshots, and invented customer proof.
- Add the requested sections:
  - Vendor-neutral approval and audit positioning
  - “Governs actions across” provider/category bar
  - Three governance problems
  - Six-step connect → sync → recommend → guard → approve → audit pipeline
  - Shipped platform capabilities
  - Why-now context
  - Fair category comparison
  - Security and architecture detail
  - Design-partner call to action
  - Product/company/legal/contact footer
- Keep every capability statement tied to the shipped Aegis implementation and avoid customer, usage, or market-leadership claims.

## Access and sign-in flow
- Add a public request-access form with name, work email, organization, role, and optional context.
- Store requests separately from user accounts; submission shows a confirmation and a clear existing-user sign-in link.
- Do not automatically create a tenant, user, or privileged role from a public form.
- Update sign-in and sign-out navigation so authenticated users enter `/dashboard`, while signed-out visitors return to the public website.
- Keep Admin/Manager/Analyst/Viewer permissions enforced by the existing server and database role system.

## Security
- Add strict validation and abuse-resistant limits to public access requests; expose no request records publicly.
- Recheck and harden profile tenant assignment and self-role assignment so users cannot switch tenants or grant themselves Admin.
- Mark only the two active security findings fixed after verification.

## SEO and accessibility
- Add unique homepage metadata and structured organization/software information without fabricated proof.
- Update the sitemap to include only public, indexable pages; authenticated platform pages remain excluded.
- Preserve semantic headings, keyboard navigation, visible focus states, reduced-motion support, image alt text, and WCAG AA contrast.

## Verification
- Run focused tests for request validation/access behavior and route protection.
- Run lint, full tests, and production build.
- Verify public homepage and authenticated `/dashboard` at desktop and mobile sizes, including form success/error states and navigation.
- Do not publish or connect a domain in this change.
