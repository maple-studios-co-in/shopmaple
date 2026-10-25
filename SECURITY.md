# Security policy and verification

Security checks are a release gate, not a claim that all vulnerabilities have been found. Keep live checkout disabled until the integration and operational gates in [the architecture](docs/architecture.md) and [order flow](docs/order-flow.md) are met.

## Reporting and response

Send suspected vulnerabilities privately to a repository administrator through an established private channel. Do not put secrets, exploit payloads against production, or customer data in a public issue. GitHub private vulnerability reporting may be used if the repository enables it; this document does not assert that the feature is configured.

Provide affected commit, impact, minimal safe reproduction, and suggested fix. For exposed real credentials, revoke/rotate them first, then remove the exposure and assess use; deleting a Git line does not revoke a key. Track remediation and regression coverage before closing a finding. Do not run invasive production tests without explicit authorization.

## Repeatable checks

```sh
npm run security:dependencies
npm run security:secrets
npm run security:secrets:staged
npm run security:static
# Dependency + committed-history + static checks in sequence:
npm run security:check
```

- **Dependencies:** `npm audit` checks the lockfile's production and development dependency graph. High/critical advisories fail the command; lower severities remain visible for triage. Never use `npm audit fix --force` without reviewing compatibility and testing the resulting patch. Registry outages fail the check; they are not a clean audit. The npm registry receives dependency metadata as part of its audit protocol.
- **Secrets:** Gitleaks 8.30.1 uses its default rules plus narrow, explained allowlists in `.gitleaks.toml`. `security:secrets` scans the complete locally available Git history, with 100% secret redaction. CI fetches complete history. The staged command scans added changes before committing; neither command scans arbitrary untracked files. Stage intended files and run the staged scan before commit. Never include local `.env`, credentials, production dumps, or Shopify admin exports in the commit. The CI history scan catches the committed result.
- **Static analysis:** Semgrep Community Edition 1.182.0 scans `apps`, `packages`, and `scripts` locally using the public JavaScript, TypeScript, and Node.js rule packs. `--error --strict` fails on findings and scanner errors. There is no Semgrep account token, cloud scan, SARIF upload, or source upload; metrics and version checks are disabled. Rule packs are downloaded from Semgrep's registry and evolve independently of the pinned engine. This enables new detections but can also change results between runs. Review new findings instead of disabling the gate.

Install the exact CLI versions locally from the [Gitleaks release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) and [Semgrep release](https://github.com/semgrep/semgrep/releases/tag/v1.182.0); a Python virtual environment can isolate Semgrep. Verify Gitleaks binary checksums against the official release. The Linux CI archive checksum is pinned in the workflow. `npm run security:check` does not install missing tools or silently skip them.

The [security workflow](.github/workflows/security.yml) runs on PRs, pushes to `main` and `codex/**`, manual dispatch, and daily at 02:17 UTC on the default branch **after the workflow is merged**. It uses read-only repository permission and does not persist checkout credentials or use production secrets. Scanners run on GitHub's runner. Dependency installation suppresses lifecycle scripts. GitHub Actions dependencies are pinned to verified upstream commit SHAs. Semgrep's Python dependency tree and downloaded rules are not hash-locked; review scanner upgrades and supply-chain changes as part of maintenance.

Dependabot checks npm and GitHub Actions weekly. Scanner binary and Python pins are maintained manually; review their upstream releases monthly and when a security advisory is published. No automatic merge is enabled by these files. An administrator must separately make `verify`, `Dependency audit`, `Secret scan`, and `Static security analysis` required branch checks. Until then they provide CI feedback but do not prevent a manual merge.

## Scope, exclusions, and review

- Gitleaks is pattern-based; a clean result does not prove all credentials are absent. The explicit current exceptions are five exact public Shopify section/divider identifiers in two landing JSON files, and one exact public Razorpay signature-example secret in its test fixture. Each exception is constrained to the generic-key rule, exact value and expected path. There is no general test-directory or JSON-key exclusion.
- Semgrep CE performs rule-based static analysis, not a full threat model, penetration test, cross-service proof, or payment certification. Its standard ignored paths and default 1 MB per-file limit apply; tests/generated assets may be excluded by default. Inspect verbose skipped-file output whenever scope changes. Review authentication, authorization, transaction races, business logic, untrusted HTML, proxy trust and webhook replay manually even with zero findings.
- Review the final diff separately for changes to checkout, ownership, secrets, webhook verification, synchronization, HTTP boundaries, and database invariants. Add adversarial regression tests for validated findings using the [TDD process](docs/testing.md). A final test result alone does not prove the RED step occurred.
- A suppression requires a narrow match, evidence, rationale, reviewer, and recheck condition. Do not baseline every existing finding, ignore entire security-sensitive directories, disable rules globally, or hide scanner failures to merge.
- CI output is not a customer-facing report. Keep secrets and personal data out of logs; redact secret scans and do not upload sensitive finding artifacts.

## Release gates for live commerce

Before accepting real payments: verified Keeri authority and reservation semantics; server-owned prices; authenticated and idempotent checkout; provider-account binding and captured-payment verification; authenticated webhooks; durable retry/recovery and stock/order reconciliation; sandbox end-to-end payment evidence; production TLS and secret storage; database backup/restore and migration recovery; rate limits and monitoring; refund/cancellation and operator procedures. See architecture and order-flow documents for the implemented-versus-pending status. Passing scanners, tests, or CI does not substitute for these gates.
