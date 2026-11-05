# deepmerge 4.3.1 (locally patched)

Copy of deepmerge 4.3.1 (MIT, see license.txt) with one change in `dist/cjs.js` `mergeObject()`:
`__proto__` keys are skipped for both target and source, which prevents prototype poisoning
(GHSA-gcqx-w48m-w2h4, no patched release upstream as of 2026-11).

Wired in through `overrides.deepmerge` in the root `package.json` (jest-config depends on it).
Delete this directory and the override once upstream publishes a fixed release.
