# Dependency remediation status

This branch is validating production dependency fixes before any release.

- The first forced npm audit remediation attempt upgraded Vite across a major version and caused the existing web build test to fail with `TypeError: manualChunks is not a function`.
- The workflow was changed to update the known vulnerable Fastify, Zod, and React Router lines without forcing a major Vite upgrade, then regenerate the lockfile and run the test/build/audit gates.
- Dependency changes must not be committed unless every gate passes.
- No DNS changes or REG.RU production deployment are authorized by this branch.
- Mobile cookie-banner behavior still requires a real-device check before production can be declared fixed.
