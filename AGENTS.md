# Agent Instructions — Agentic Order Service UI

## Scope and contract

This independent repository is a React/TypeScript administration prototype. Prioritize working functionality and a maintainable structure over production infrastructure. Preserve existing files and products/customers/orders boundaries. Project Markdown, code and agent reports use English.

[api/openapi.json](api/openapi.json) is the authoritative backend-generated REST snapshot; [docs/api-discovery.md](docs/api-discovery.md) describes capabilities. Use [src/shared/api/schema.d.ts](src/shared/api/schema.d.ts); never edit generated declarations manually. Do not invent endpoints, fields or behavior. Refresh the snapshot and regenerate types only within authorized contract work. Report runtime/snapshot mismatches instead of adapting the backend. Do not alter either contract file during configuration setup.

No backend changes, migrations, backend CORS/security changes, authentication system or Change Request workflow machinery. No frontend feature implementation, npm package installation or application builds during configuration-only setup. Stop for human review before frontend development.

## Orchestrator and native delegation

The main Codex session is the sole Orchestrator. Exactly six configured specialists exist: requirements, architect, implementer, tester, reviewer and documenter. Use actual native sub-agent delegation where supported for meaningful bounded work. Keep at most three specialist threads open concurrently; finish/reuse agents before opening more. No seventh specialist and no recursive delegation. Never delegate when the user prohibits it. Do not claim project configuration was loaded merely because a role was invoked from another project's session.

Interpret exact scope and distinguish investigation, maintenance, implementation and review. Narrow maintenance and read-only investigation must not automatically trigger the entire workflow. Select only relevant specialists; no mandatory six-agent ceremony. For implementation obtain relevant requirements/architecture handoffs before dependent edits, then verify, independently review and update affected documentation. Wait for dependent handoffs.

Assign one writer per file, with explicit scope, inputs, expected output and dependencies. Specialists are not alone in the repository: preserve unrelated worktree changes and concurrent edits, never revert another writer's work, and report conflicting ownership. The Orchestrator owns sequencing and evidence consolidation. Handoffs state scope, files read/changed, findings/decisions, actual commands/counts/exit codes, limitations/blockers and next dependency. No extra workflow record files are required.

Implement only authorized scope. Resolve routine prototype choices autonomously; stop dependent work for genuinely blocking architectural/security decisions or scope expansion. Complete independent authorized work when another check is unavailable. Enforce at most three correction iterations after initial implementation, shared across agents and restarts; report remaining issues after the limit.

## Frontend direction and environment

Prefer React, TypeScript, Vite and Mantine, native fetch and simple React state. Avoid unnecessary abstractions, state frameworks and dependencies. New packages must belong to the approved frontend stack or receive explicit authorization; preferences do not authorize installation during configuration setup.

For later application setup, define explicit connectivity through a narrowly scoped Vite development proxy and a fixed backend target configured by server-only BACKEND_URL in .env.local, initially http://127.0.0.1:18080. Load it in Vite server configuration. Reserve VITE_ variables for intentionally public browser configuration; never store credentials or secrets in Vite variables. No generalized arbitrary-target proxy or runtime Settings UI for changing backend URL. Provide .env.example later during application setup; create no environment files now.

Use dedicated product-image endpoints, binary responses and the required multipart file part. Product creation and image upload are separate operations. Handle loading, empty states, missing images, API code/message and bodyless 204 responses. Do not automatically replay writes after uncertain outcomes. Avoid unsafe HTML and careless credential handling; use appropriate confirmation for dangerous actions.

## Proportional quality gates

For application increments require npm run typecheck, npm run build, configured Vitest tests (npm test or existing equivalent), ESLint when configured, independent review and API contract consistency for changed features. Add a small number of meaningful behavioral/API integration tests. Claim browser verification only when actually performed. No arbitrary coverage percentage.

For configuration-only work verify all TOML parsing, exactly six role files, configured role-path existence, Orchestrator/specialist consistency and git diff --check. Inspect untracked files explicitly because ordinary git diff omits them. Do not install packages or run application builds. Never run Maven, Testcontainers, PIT, JaCoCo, SonarQube, Java integration tests or backend CI.

Unrun/unavailable checks are Pending or Not Applicable with reasons, never Passed. Report created/modified files, actual tracked and untracked status, verification evidence, limitations and outstanding decisions. Self-review is not independent review. Human acceptance remains Pending until explicitly given. Never stage, commit, push, merge, create pull requests or deploy without separate explicit authorization for that action.
