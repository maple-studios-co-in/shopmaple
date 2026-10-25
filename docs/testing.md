# Testing and TDD

This policy applies to the frontend, API, shared contracts, adapters, workers, and executable tooling. It starts with current work; existing tests do not establish that older implementation was written test-first.

## The required loop

1. Describe the observable behavior and a realistic bug the test will catch. Derive expected values independently of production helpers.
2. **RED:** add the smallest useful test and run it before implementation. Confirm an assertion fails because the behavior is missing or wrong. Repair setup errors first. Save the command and concise failure in the PR evidence.
3. **GREEN:** implement the smallest change that satisfies the behavior; rerun the same command. Keep the test asserting the original contract.
4. **REFACTOR:** simplify while retaining green tests. Add another failing test before introducing additional behavior.
5. Run the entire project suite, typecheck, build, and security checks before declaring the increment complete. Record failures and skipped or environment-dependent checks explicitly.

For legacy changes, first characterize relevant existing behavior, then reproduce the bug or new requirement with a failing test. A passing characterization test is useful coverage but is not RED evidence. Do not rewrite unrelated stable code solely to claim project-wide TDD.

Configuration and prose receive parser/build/workflow or human validation, not tests that merely search for exact text. Custom executable scripts do require behavior tests against controlled inputs, outputs, side effects, and exit codes.

## Commands

Use Node.js 22. Follow [development setup](development.md) to create the local environment, generate Prisma, and migrate **both** development and dedicated test databases. Tests may delete fixtures and must use the dedicated test database.

```sh
# Focused API test (from apps/api; example file)
npx tsx --env-file=../../.env --test --test-concurrency=1 test/api.test.ts

# Focused frontend test (from apps/web)
npx tsx --tsconfig test/tsconfig.json --test test/navigation.test.tsx

# Final repository verification (from repository root)
npm test
npm run typecheck
npm run build
npm run security:check
```

Substitute an existing test path for the focused example. Scanner installation and scope are described in [SECURITY.md](../SECURITY.md). The static and secret commands require their CLIs on `PATH`; missing tools must fail, not silently skip.

## Test boundaries

| Area | Required behavior evidence |
| --- | --- |
| UI | Real component interactions, keyboard/focus behavior, error/loading states; browser checks at desktop and mobile sizes for layout fidelity |
| HTTP API | Real router and validation; unauthorized, malformed, oversized and conflicting requests; stable public error responses |
| Database | Real dedicated PostgreSQL transactions, ownership, uniqueness, atomicity, idempotency and concurrent requests where relevant |
| Commerce | Server-owned prices and quantities, stale cart rejection, currency/merchant binding, reservation failures, retries, and tampered/duplicate events |
| External adapters | Local HTTP server or transport double with independently specified payloads; bounded timeouts, malformed responses, denied credentials and safe retries |
| Workers | Durable retry/lease behavior, duplicate suppression, terminal errors, and recovery after interrupted processing |

Keep doubles at network boundaries. Do not mock the transaction or authorization logic being tested. No live card charges, customer notifications, real stock changes, or production orders in the automated suite. Sandbox merchant verification remains a separate release check.

Coverage percentages alone are not a release gate. Ask whether a wrong branch, missing write, unauthorized caller, or duplicated delivery would fail a test. Report material uncovered paths rather than manufacturing assertions for a percentage.

## Evidence to retain

Each PR records the behavior, focused RED command and assertion, GREEN result, full-suite result, security results, and residual limitations. Local logs may remain outside Git if they contain machine paths; never retain secrets or customer data. CI must execute the final commit. CI validates the resulting implementation; the reviewer checks the recorded development sequence because CI cannot prove tests were written first.

GitHub's existing `verify` job runs tests/typecheck/build with PostgreSQL. The separate security workflow runs scanners on PRs, relevant pushes, manual dispatch, and daily on the default branch once merged. Required branch-protection checks must be configured separately by a repository administrator; adding workflow files does not enforce merge protection by itself.
