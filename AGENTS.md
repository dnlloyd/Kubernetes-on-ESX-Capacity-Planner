# Instructions for Codex

## Read first

Read README.md, docs/HANDOFF.md, docs/MODEL.md, and docs/ARCHITECTURE.md before changing model behavior. This is an existing working product, not a request to rebuild it in a different framework.

## Scope and working conventions

- Preserve exactly three ESX clusters named AZ1, AZ2, and AZ3.
- Support one or two Kubernetes clusters, each with independent profiles and deductions.
- Preserve browser-saved scenarios. Do not clear storage, reset the example, or overwrite user imports to test a change.
- Use a separate localhost port or isolated fixture for test scenarios. Do not mutate the live user's scenario for demonstrations.
- Keep the UI concise. Put lengthy explanations inside existing collapsible details panels.
- Implement only requested changes. Discuss assumptions before changing capacity semantics or physical/logical CPU and GB/GiB conventions.
- Node types are etcd, master, ingress, and worker. Public is a legacy import alias, not a current UI label.
- With affinity enabled, use independent master/ingress placement, per-cluster role separation, and the shared strict NUMA planner: two CPU cores and half the largest configured etcd memory per node reserved; four-vCPU etcd split 2+2 across two nodes. Do not restore mandatory pairs or worker-count caps.
- Do not reintroduce host pinning or dedicated pet hosts. Automatic host placement and the affinity toggle are the current design.

## Source and build

Edit the modular source: index.html, styles.css, app.mjs, model.mjs. Regenerate az-planner.html with `python3 scripts/build.py`. Do not patch generated HTML alone. Do not change the storage key or schema casually; implement backward-compatible migration whenever persisted data changes.

The current bundler assumes one model module and one app import line. It also embeds model code plus mobility-worker.mjs (after its import line) as the self-contained assessment worker. Extend the build intentionally if adding modules. Keep the app usable without a package installation or backend unless a migration is requested.

## Validation

Run `python3 scripts/test.py` after model, export, or migration changes. Add focused tests for changed behavior; do not revive obsolete pinning/dedication tests. For UI changes, verify in the browser and check relevant narrow and wide layouts, keyboard labels, collapse state, and existing drag/drop or move controls. Check that all VMs remain visible exactly once, including spanning and unplaced VMs.

The Node tests cover model behavior, not full browser interaction. A passing suite alone does not verify visual layout or actual downloads. Test CSV/JSON downloads when changing exports.

## Important model distinctions

- Always leave the last ESX host in each AZ empty and label it Reserved for maintenance, with affinity on or off. ESX aggregate capacity reserves that same one host per AZ for N+1. Individual host capacities stay at configured size; NUMA memory capacity uses 90% of host memory divided by the NUMA node count (10% ESX overhead allowance).
- Client workload budgets use placed worker VM resources minus node reservations and cluster services. Do not subtract the ESX N+1 reserve again from those budgets.
- VM/ESX memory inputs currently represent decimal GB. Workload budget memory is GiB. Preserve separate units and conversions.
- ESX host/AZ CPU summaries use logical capacity. NUMA CPU bars compare allocated vCPUs against physical cores, matching NUMA placement and contention thresholds.
- NUMA placement is derived planning output, not actual ESXi telemetry, vNUMA configuration, or enforced affinity.

## Review handoff

Summarize what changed, what was checked, and material limitations. Clearly disclose AI-generated code changes in the handoff or PR. Do not add authorship banners to every source file.
