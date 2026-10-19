# K8s CAPPlanner

Local browser application for Kubernetes VM placement and capacity planning across exactly three ESX clusters: AZ1, AZ2, and AZ3.

This handoff contains the exact application source and generated app captured on October 16, 2026. No framework, package installation, database, or backend API is required. Google Fonts are optional; system fonts are used if unavailable.

## Start

From this directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173/az-planner.html for the self-contained app, or http://127.0.0.1:4173/index.html for modular development. Leave the server running. If port 4173 is already occupied by the previous app, stop that server first or choose a different port. Changing the hostname or port changes the browser storage origin.

Python 3 is needed for serving and building. Node.js 18 or newer is needed only for the tests.

## Continue in Codex

1. Extract the entire ZIP into its own folder.
2. Open that extracted folder as a Codex project.
3. Have Codex read `AGENTS.md` and `docs/HANDOFF.md` before making changes.
4. Run the tests and start the app using the commands here.

Suggested first prompt:

> Read AGENTS.md and docs/HANDOFF.md. Run the current tests, start K8s CAPPlanner on localhost, and confirm that it works. Preserve the existing model assumptions unless I request changes.

## Bring your current region settings

Source code does **not** contain the currently edited browser scenario. Before moving to another browser, hostname, port, or computer, use **Export scenario** in the current app. Import that JSON with **Import scenario** in the new app. This preserves the title, host settings, cluster profiles, deductions, affinity mode, and VM placements. Capacity CSV is a report and cannot restore a scenario.

Using the same browser and `http://127.0.0.1:4173` normally retains existing local storage. Still export JSON as a backup before transitioning. The example defaults differ from the user's saved HACAS scenario; do not reset to the example to recover current settings.

## Current placement rules

The last ESX host in each AZ is always kept empty and labeled Reserved for maintenance. This is the same reserve already deducted from aggregate N+1 capacity. With affinity enabled, the planner reserves an etcd slot on every NUMA node, models four-vCPU etcd as 2+2, and places master/ingress/worker VMs independently within local CPU and memory budgets. Masters and ingress are separated by Kubernetes cluster and role across hosts. See docs/MODEL.md for the full rules and saved-scenario migration.

## Modeled vMotion readiness

Expand **Modeled vMotion readiness** below the placement board and click **Run assessment**. Each VM is tested independently against other active hosts in its AZ. Expand a result for eligible hosts and rejection reasons, or filter by AZ and status. Maintenance hosts cannot receive VMs. The assessment leaves placements unchanged, runs in the background with cancellation, and marks results out of date after placement inputs change. Results estimate model fit, not actual VMware compatibility or host evacuation.

## Develop and check

Edit `index.html`, `styles.css`, `app.mjs`, and `model.mjs`. Rebuild after source edits:

```sh
python3 scripts/build.py
python3 scripts/test.py
```

`az-planner.html` is generated and should not be edited directly. The build follows the existing bundling convention: inline CSS, remove model `export` keywords, then append app code after removing its first import line. Keep that convention in mind if introducing new modules or exports.

## Included files

- `AGENTS.md`: instructions for Codex.
- `index.html`, `styles.css`, `app.mjs`, `model.mjs`: authoritative source.
- `az-planner.html`: exact current self-contained app.
- `mobility-worker.mjs`: background VM mobility assessment.
- `USER-GUIDE.txt`: user-facing guide retained verbatim.
- `scripts/`: repeatable build and regression-test runner.
- `tests/`: current model regression tests.
- `docs/ARCHITECTURE.md`: code layout, persistence, and exports.
- `docs/MODEL.md`: formulas, units, placement rules, and limitations.
- `docs/HANDOFF.md`: current state and product decisions.
- `SOURCE-SHA256.txt`: checksums of the six original application files.

The original app files were copied byte-for-byte. Tests were relocated and their import paths adjusted; the CSV test's scratch-file write was removed. Obsolete tests for earlier host pinning/dedication behavior are intentionally excluded.

This project contains AI-generated code changes prepared by Codex. No license or ownership grant is implied by this handoff.
