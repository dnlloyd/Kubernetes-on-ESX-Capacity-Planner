# Architecture

## Runtime

A static vanilla HTML/CSS/JavaScript application. No server-side logic or vCenter/Kubernetes integration. A static HTTP server supplies the files. External Google Fonts are optional presentation assets.

- `model.mjs`: pure scenario operations, validation, migrations, placement, NUMA estimates, capacity math, CSV serialization.
- `app.mjs`: DOM rendering, event delegation, form drafts, saved state, drag/drop, downloads, notifications.
- `index.html`: static shell and controls, loads the two modules through app.mjs.
- `styles.css`: all presentation, responsive layout, collapsed configuration drawer, host and NUMA containers.
- `az-planner.html`: generated single-file distribution.

## State and persistence

The current scenario schemaVersion is 6. Scenario fields include title, regionType, affinityEnabled, uniform host topology/resources, a three-element host-count array, Kubernetes cluster profiles/deductions, and individual VM placements.

Browser localStorage keys:

- `az-planner-scenario-v2`: scenario JSON.
- `az-planner-expanded-hosts-v1`: expanded ESX host cards.
- `az-planner-configuration-collapsed`: left panel preference.

`normalizeState` handles older schemas, former pin/dedication data, missing defaults, and public → ingress migration. Preserve imported VM IDs, sizes, and placements where current validation permits. Invalid/conflicting ingress/public profiles are rejected rather than silently dropped.

regionType remains in scenario data for compatibility, but its old selector has been replaced with the editable Region Title field. `title` is the active display and export name.

Configuration edits are drafts until Apply configuration. Deduction changes use Apply deductions. Title edits save without recalculating placement. Collapsing a panel should preserve its draft inputs.

## Placement and rendering

`reconcile` derives VM instances from profiles. `assignHosts` allocates hosts inside AZs. `distribute` distributes VMs across AZs and then assigns hosts. `pairedVM`, `affinitySummary`, and validation enforce affinity semantics when enabled.

`numaPlan` returns node capacities/totals and a per-VM map. Each placement contains CPU and memory allocation arrays indexed by NUMA node, plus home, involved CPU nodes, remote-memory estimate, overflow, wide, and contention indicators. These arrays must sum back to each VM and to node totals.

The expanded host view nests fully local VMs inside their node. A VM involving multiple CPU or memory nodes appears once in a shared spanning row, with per-node allocation values. Node meters already include spanning VM allocations. Collapsed hosts show total VMs, per-type counts, CPU/memory, and status.

## Reports and downloads

Export scenario produces JSON via a Blob download. Import validates and normalizes JSON. Titles generate sanitized filenames through scenarioFilename.

Export capacity CSV uses capacityCsv(state). It includes all Kubernetes clusters, with client summary/calculation rows and configured VM type/total rows. Columns distinguish GB from GiB. UTF-8 BOM, CRLF lines, quoted/escaped text, spreadsheet-formula protection for text, and up to six decimal places are deliberate. Blank memory columns mean the other unit applies; do not sum the repeated summary and calculation budget rows.

Browser settings and imports are user data, not part of the shipped source. Export JSON before moving origins.
