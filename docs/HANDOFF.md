# Handoff to Codex

Snapshot date: October 16, 2026 (America/Chicago).

## Current product

Name: **K8s CAPPlanner**. Heading: **Kubernetes placement and capacity on ESX**. Region Title is an editable field in the banner, included in scenario JSON. There is no longer a region-type selector or duplicate title field.

The Configuration panel collapses horizontally, remembering its preference. Both Kubernetes cluster profiles are visible. ESX host cards collapse individually, display per-type VM counts, and expand into NUMA node containers with separate CPU and memory meters. Spanning VMs appear once across the node columns with allocation details.

Affinity has a compact on/off control and closed Rule details. The old redundant note below the board and the footer suffix “no host pinning” were removed. The current role name is ingress, with automatic migration of older public scenarios. The independent-role and reserved-etcd policy below supersedes the initial handoff pairing behavior.

Bottom capacity cards show placed-worker client budgets. Collapsible panels hold deduction assumptions/editors and configured VM totals. Export capacity CSV exports all three sections for both clusters. Export scenario remains JSON for restoration.

## Decisions to preserve

- N+1 reserves the last host per AZ in placement and aggregate CPU/memory totals. Do not subtract another host from client workload budgets; those use placed workers.
- GB inputs and GiB workload budgets are distinct; do not change this merely because their totals differ.
- No host pinning or dedicated pet hosts; use the current independent-role affinity rules and automatic allocation.
- Editable custom role names and optional master pairing were explored as mockups but **not implemented**. The user chose only a public → ingress rename for now.
- NUMA visual alternatives were explored; Node containers was implemented. Keep the clear CPU-versus-memory bar labels.
- This is a planning simulator, not production scheduler configuration or live telemetry.

## Verification included

Ten current model test files cover affinity on/off and scarcity, configured capacities, baseline deductions, N+1 distinctions, legacy ingress migration, NUMA allocation reconciliation, and CSV formatting/content. Run `python3 scripts/test.py`.

Browser interaction has also been checked during development, including collapsed panels, node containers, scenario-title persistence, and an actual CSV download. No browser automation framework is bundled; future UI changes require browser review.

## Exact source and data portability

Six files at the root match the running app source byte-for-byte; see SOURCE-SHA256.txt. Added documentation and build/test helpers are handoff material. No attachments, private screenshots, personal absolute paths, temporary servers, or obsolete design mockups are needed to run the project.

Current browser scenario settings are not embedded in source. Export scenario JSON from the existing app, then import it after moving. The current user's region title has been “HACAS Presentation Tier - Oct 15”, but that title and configuration must come from their saved scenario rather than hard-coded defaults.

## Useful first actions

1. Run the regression suite and build consistency check.
2. Start the static server, inspect the existing app, and import the user's JSON if moving origins.
3. Verify any future changes against the preserved calculations and product decisions above.

The app source and handoff documentation include AI-generated work prepared by Codex. No Git repository history or license file was present in this source snapshot; do not invent either.

## NUMA memory allowance update

NUMA memory capacity now reserves a fixed 10% of host RAM before dividing by the configured node count. For 768 GB and two nodes this is 345.6 GB per node. This is a planning assumption, not measured ESXi overhead. It affects NUMA fit/overflow and bars, without changing AZ N+1 totals or client workload budgets. The additional regression test verifies these boundaries.

## Current placement policy update

Placement policy version 2 supersedes the earlier mandatory master/ingress pairing and worker-count limits. Roles are independent, with at most one master/ingress of each type per Kubernetes cluster per host. All nodes reserve two CPU cores and half the largest configured etcd memory; etcd is explicitly split 2+2. Other VMs must fit locally in remaining physical CPU and memory budgets. Assignment, validation and display share affinityPlan. Legacy affinity-enabled saves are migrated within existing AZs, preserving VM identities and configured demand. No actual VMware affinities are applied.

## Maintenance reservation update

Placement policy version 3 always excludes the last ESX host in each AZ, with affinity on or off, and labels it Reserved for maintenance. Older saves using that host are repacked within their existing AZs. Configured demand is retained; VMs that cannot fit remain unplaced. Aggregate N+1 math is unchanged, and client budgets still derive from placed workers.

## Individual mobility assessment

A collapsed Modeled vMotion readiness panel provides Run assessment, cancellation/progress, AZ/status filters, per-VM eligible hosts and rejection reasons. It never applies migrations. Both modular and self-contained entry points run the assessment in a Web Worker. Results are marked out of date after relevant changes. Maintenance-mode hosts are always excluded, and drops onto those cards are explicitly refused. See docs/MODEL.md for affinity-off capacity semantics and scope.

## New-scenario defaults

New scenarios and Reset use one cluster with 5 etcd (4/16), 3 master (6/32), 3 ingress (6/16), and 6 workers (12/60), in vCPU/GB. ESX uses 2 sockets, 24 cores/socket, HT active, 768 GB, 2 NUMA nodes, hosts 4/4/4. Affinity rules are disabled by default. Saved scenarios are not overwritten. Historical resource regression tests use tests/fixtures.mjs; tests/test-defaults.mjs checks the new UI defaults directly.

Reset is a standard secondary button and restores the current new-scenario defaults with affinity disabled. It also clears transient mobility results and filters. Undo can recover the prior scenario. An already open browser page must be refreshed to load updated source before Reset uses the latest defaults.

Default deductions are now 0.5 vCPU / 8.5 GiB per worker plus 60 vCPUs / 250 GiB Platform overhead per cluster. Platform overhead replaces the Services label in the UI and CSV; existing servicesCpu/servicesMemoryGiB JSON fields remain compatible. Historical measurements remain documented as provenance. Saved deductions are preserved.
