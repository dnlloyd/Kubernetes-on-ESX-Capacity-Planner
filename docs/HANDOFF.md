# Handoff to Codex

Snapshot date: October 16, 2026 (America/Chicago).

## Current product

Name: **K8s CAPPlanner**. Heading: **Kubernetes placement and capacity on ESX**. Region Title is an editable field in the banner, included in scenario JSON. There is no longer a region-type selector or duplicate title field.

The Configuration panel collapses horizontally, remembering its preference. Both Kubernetes cluster profiles are visible. ESX host cards collapse individually, display per-type VM counts, and expand into NUMA node containers with separate CPU and memory meters. Spanning VMs appear once across the node columns with allocation details.

Affinity has a compact on/off control and closed Rule details. The old redundant note below the board and the footer suffix “no host pinning” were removed. The current role name is ingress, with automatic migration of older public scenarios.

Bottom capacity cards show placed-worker client budgets. Collapsible panels hold deduction assumptions/editors and configured VM totals. Export capacity CSV exports all three sections for both clusters. Export scenario remains JSON for restoration.

## Decisions to preserve

- N+1 reserve stays in ESX aggregate CPU/memory totals only. A later attempt to subtract it from client workload budgets was explicitly undone.
- GB inputs and GiB workload budgets are distinct; do not change this merely because their totals differ.
- No host pinning or dedicated pet hosts; use the current affinity rules and automatic allocation.
- Editable custom role names and optional master pairing were explored as mockups but **not implemented**. The user chose only a public → ingress rename for now.
- NUMA visual alternatives were explored; Node containers was implemented. Keep the clear CPU-versus-memory bar labels.
- This is a planning simulator, not production scheduler configuration or live telemetry.

## Verification included

Nine current model test files cover affinity on/off and scarcity, configured capacities, baseline deductions, N+1 distinctions, legacy ingress migration, NUMA allocation reconciliation, and CSV formatting/content. Run `python3 scripts/test.py`.

Browser interaction has also been checked during development, including collapsed panels, node containers, scenario-title persistence, and an actual CSV download. No browser automation framework is bundled; future UI changes require browser review.

## Exact source and data portability

Six files at the root match the running app source byte-for-byte; see SOURCE-SHA256.txt. Added documentation and build/test helpers are handoff material. No attachments, private screenshots, personal absolute paths, temporary servers, or obsolete design mockups are needed to run the project.

Current browser scenario settings are not embedded in source. Export scenario JSON from the existing app, then import it after moving. The current user's region title has been “HACAS Presentation Tier - Oct 15”, but that title and configuration must come from their saved scenario rather than hard-coded defaults.

## Useful first actions

1. Run the regression suite and build consistency check.
2. Start the static server, inspect the existing app, and import the user's JSON if moving origins.
3. Verify any future changes against the preserved calculations and product decisions above.

The app source and handoff documentation include AI-generated work prepared by Codex. No Git repository history or license file was present in this source snapshot; do not invent either.
