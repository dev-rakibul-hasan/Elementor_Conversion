# Pipeline corrections

The conversion contract is one screenshot to one Elementor page. Multiple DIR pages and template-library publishing are rejected explicitly. Vision can request one bounded reanalysis of a validated canvas crop; extracted assets keep coordinates in the original screenshot. Missing asset coordinates cause a clear failure rather than a guessed crop.

AI cache keys include the complete request messages, source hash, stage, and schema/skill/prompt versions. Invalid responses are invalidated with the same key. Generated AI layouts are checked against the DIR and deterministic compiler before acceptance. The quality audit records structural checks; no screenshot comparison or rendered visual preview is claimed. Export, stored artifacts, and publication use the same serialized document.

Worker updates are fenced by worker ID and attempt. Retries preserve monotonic attempt numbers, renew the retry allowance, and refuse active jobs. Cancellation invalidates the old worker. Publishing uses a separate lease and is excluded from conversion claiming. The retry UI describes a conversion retry; stage-specific resume is not offered.

Original and generated files use the configured storage backend. Media publication reads through the stored backend, is scoped to the owning project, and fails before page creation if an upload fails. B2 originals are served through the same client storage URLs as local originals. Quota enforcement locks the owner and reconciles the asset ledger, including generated files from older versions. Deletion removes stored files and reconciles remaining quota; failed cleanup leaves remaining records available for retry.

Real WordPress connections never become simulations. Upgrade `wordpress-plugin/elementor-mcp-bridge.php` on each target site before publishing. Version 1.1 enforces page permissions, preserves page settings, saves idempotent receipts, and supplies saved-content read-back. An interrupted remote operation stays reserved for reconciliation. Publication failures return HTTP errors, and the client checks the result. Read-back compares content and settings semantically, including PHP empty-object representation.

Implemented missing latest-job, artifact, cancel, site-delete, and capability routes. Removed unused client usage/settings helpers because those server features do not exist. Uploaded descriptions are saved. Production login excludes the development shortcut; the server also rejects it.

## Verification

Run the full server suite with `node scripts/test-isolated.mjs` from `server/`. It creates a unique schema on local PostgreSQL and drops only that schema afterward. Synthetic test storage is preserved under `server/storage/pipeline_test_*` for inspection. The suite includes concurrent quota, stale-worker, API ownership, B2 transport, cache, canvas, and publishing regressions. Run client tests with `npm test` from `client/`.

PHP bridge contract tests can be run with `php -n wordpress-plugin/tests/bridge.test.php` from `server/`. These use WordPress function stubs and do not mutate a WordPress site. Live AI, B2, and WordPress calls are not part of these verification runs.
