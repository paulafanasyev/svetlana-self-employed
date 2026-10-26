# Dependency remediation status

This branch is validating production dependency fixes before any release.

- The first forced npm audit remediation attempt upgraded Vite across a major version and caused the existing web build test to fail with `TypeError: manualChunks is not a function`.
- The workflow was changed to update the known vulnerable Fastify, Zod, and React Router lines without forcing a major Vite upgrade, then regenerate the lockfile and run the test/build/audit gates.
- Dependency changes must not be committed unless every gate passes.
- No DNS changes or REG.RU production deployment are authorized by this branch.
- Mobile cookie-banner behavior still requires a real-device check before production can be declared fixed.

- The automation now targets workspace dependencies explicitly; CI will decide whether the compatibility checks and production audit pass before committing any generated lockfile.

- Latest gated run passed lint, backend tests, web tests, static build, and `npm audit --omit=dev --audit-level=high`; dependency manifests and lockfile were committed by the workflow after those gates passed.
