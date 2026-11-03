# Model assumptions and calculations

## Topology and CPU

Exactly three AZs represent a region. All ESX hosts have identical configured resources. Logical CPUs = sockets × physical cores/socket × (2 if hyperthreading active, otherwise 1). The default sockets value is 2 and hyperthreading is active. NUMA defaults to two nodes total per host, with equal CPU and memory resources; it is not inferred as one node per socket.

VM CPU values represent vCPUs compared directly against logical host CPUs. They are configured allocations, not measured utilization. Physical-core count remains visible and informs the separate NUMA contention heuristic.

## Configurable ESX maintenance reserve

maintenanceReserve is a shared number of reserved hosts per AZ, default 1 (N+1); 2 means N+2. It must be a whole number from 1 through the smallest AZ host count. Apply configuration commits this draft input and recalculates placements within the same AZs.

AZ CPU capacity = (host count − maintenanceReserve) × host logical CPUs.
AZ memory capacity = (host count − maintenanceReserve) × host memory GB.
Region totals sum these reduced AZ capacities. The last maintenanceReserve hosts in each AZ are labeled Reserved for maintenance and receive zero VMs with affinity on or off. They are also excluded from mobility destinations. Reserving all hosts leaves all VMs in that AZ visibly unplaced. Individual host and NUMA capacities stay unchanged. This is one shared reserve used in placement and aggregate capacity; client budgets still use placed workers, without subtracting it again.

## Kubernetes profiles

One or more labeled Kubernetes clusters; there is no fixed cluster-count cap and the default remains one. The existing 3,000-VM region limit still applies. Each has etcd, master, ingress, and worker profiles. VMs of a type within a cluster have homogeneous resources; cluster profiles may differ. Counts may be zero. New scenarios and Reset use one cluster: 5 etcd (6 CPU/16 GB), 3 master (6 CPU/32 GB), 3 ingress (10 CPU/16 GB), and 6 workers (21 CPU/60 GB). ESX defaults are 2 sockets × 24 physical cores/socket, hyperthreading active (96 logical CPUs), 768 GB RAM, 2 NUMA nodes, and host counts AZ1/AZ2/AZ3 = 4/4/4. Affinity rules are disabled by default; off-mode placement may exceed capacity and displays warnings. Saved scenarios keep their own settings.

## Affinity enabled (placement policy version 4)

- At most one etcd VM per ESX host across all Kubernetes clusters. Its profile must have six vCPUs and the host exactly two NUMA nodes; incompatible etcd VMs remain unplaced with an explanatory warning.
- Every NUMA node reserves three physical-core equivalents for etcd. Non-etcd VMs must fit within physical cores minus three, even when the host has no etcd VM.
- Reserve half the largest configured nonzero-count etcd profile's memory on each node. This keeps memory capacity available for an etcd placement. A placed etcd consumes the slot, not a second deduction. If there are no configured etcd VMs, the memory reserve is zero; the CPU reserve remains two.
- A placed etcd is modeled with 3 vCPUs and half its memory per node. This represents the assumed explicit vNUMA policy; the app does not configure VMware or claim actual memory locality.
- Each worker, master, and ingress must fit completely in one NUMA node's remaining CPU and usable memory. No matching numeric suffix, pairing, partner count, or shared AZ is required.
- At most one master and at most one ingress **from each Kubernetes cluster** per host. Different Kubernetes clusters may share if resources fit.
- No artificial worker-count cap: 21-vCPU workers fit at most one per 24-core node with this reserve; smaller workers may share a node.

Largest-first placement spreads every role across eligible hosts. Host selection minimizes projected peak CPU or memory utilization, then combined utilization, VM count, and host index for deterministic ties. CPU pressure uses physical cores and memory pressure uses RAM after the 10% ESX allowance; the strict NUMA reserves and role constraints still determine eligibility. Rebalance hosts preserves each VM’s AZ. Host NUMA allocation is recomputed canonically using the same function as validation and rendering. This is a deterministic heuristic, not guaranteed optimal bin packing. Failed placements remain visible as unplaced and are excluded from client budgets. Nothing is discarded or moved to another AZ automatically.

Disabling rules retains the previous unrestricted resource balancing and best-effort NUMA estimates; overcapacity is allowed and warned. The maintenance host remains excluded when rules are disabled; overcapacity on the remaining hosts is allowed and warned.

## NUMA view

With rules disabled: largest-memory-first, CPU balancing, equal node resources after a fixed 10% ESX memory reserve. NUMA memory per node = host memory GB × 0.9 / NUMA node count. For 768 GB and two nodes this is 345.6 GB per node. This is a planning allowance, not measured overhead; it changes NUMA memory fit, spanning, overflow, and meters only, without changing host/AZ totals or client workload budgets. A VM larger than a node's physical-core count is classified as wide for CPU allocation. A smaller VM can still receive remote memory if it cannot fit on the selected home node. Keep CPU spanning and memory spanning distinct.

Node CPU bar = allocated vCPUs / node physical cores; memory bar = allocated GB / node GB. Values above 100% indicate physical-core oversubscription, not measured CPU utilization. Host/AZ summaries continue using logical CPUs. Green means local fit under the heuristic; amber signals memory/CPU risk; blue marks wide CPU placement. These are not measured performance or ESXi decisions. Do not fabricate NHN, N%L, or actual memory locality.

## Workload budget and units

Existing VM/host memory inputs are treated as **decimal GB**. This was explicitly discussed with the user and has not been changed to GiB. Workload budgets use GiB:

- Gross CPU = placed workers × worker CPU.
- Gross memory GiB = placed workers × worker memory GB × 1,000,000,000 / 1,073,741,824.
- Client CPU = max((gross CPU − placed workers × node CPU reserve) × (1 − enabled Kubernetes reserve percentage / 100) − platform overhead CPU, 0).
- Client memory GiB = max((gross GiB − placed workers × node memory reserve GiB) × (1 − enabled Kubernetes reserve percentage / 100) − platform overhead GiB, 0).

Only placed workers contribute. Etcd/master/ingress and unplaced workers do not. The configured VM totals section includes all configured VMs, including unplaced demand, and uses GB. No extra ESX N+1 deduction applies to the worker budget.

Default deductions, independently editable per Kubernetes cluster:

- Node CPU: 12 Capacity − 11.5 Allocatable = 0.5 vCPU per worker.
- Node memory: 8.5 GiB per worker, rounded up from the supplied Capacity-to-Allocatable measurement of approximately 8.419196 GiB. It is an editable assumption, not a live calculation from VM size.
- Platform overhead: fixed 60 vCPUs and 250 GiB once per Kubernetes cluster, rounded up from the user's worker-only platform namespace snapshot of 56.295 CPU / 244.075 GiB across 1,577/1,577 pods.

These planning defaults are reused for newly added clusters. Saved scenarios retain their configured deductions. It is not scaled by worker count. Values are a baseline, not peak demand or Kubernetes requests. Node reservations are assumed constant at other worker sizes. Budgets are before existing client consumption. No extra growth or pod-request headroom is included. Excessive deductions clamp the result to zero and produce a warning.

## Individual VM mobility

vmMobility tests one placed VM at a time against every other host in its existing AZ, keeping all other host memberships fixed. Maintenance hosts are always rejected. Affinity-on destinations must pass affinityPlan, including local NUMA resources and role constraints; that planner may rearrange suggested NUMA allocations inside the destination. Affinity-off destinations must stay within logical host CPU and raw configured RAM, even though normal off-mode assignment allows overcapacity. Zero eligible hosts is blocked, one is limited, two or more is movable. Unplaced VMs are reported separately, not assigned a mobility result. These independent results cannot be combined into a simultaneous migration or evacuation plan. The assessment does not change scenario state and does not verify actual vSphere compatibility or migration-time resource usage.

## Kubernetes capacity reserve

kubernetesReserve stores one shared {enabled, percent} setting for all Kubernetes clusters. It defaults to enabled with percent = 100/6 (exactly one sixth, displayed as 16.67%). This is a worker-capacity allowance for maintenance or disaster, separate from ESX maintenanceReserve. It deducts the same percentage of nonnegative worker allocatable CPU and memory after node reserves and before fixed platform overhead; overhead is not scaled down. Toggle off removes only this percentage deduction. Percentages from 0 through 100 are accepted. Changes affect client budgets and their CSV breakdown, not placement, ESX capacity, configured demand, or mobility results. The input displays two decimals but preserves the exact fraction until edited. If deductions exceed available resources the result is clamped to zero.

New scenarios, Reset, and older JSON missing this field use the enabled one-sixth default. Explicit imported settings, including off, are retained. Scenario export includes the setting. Each capacity CSV calculation includes a Kubernetes reserve row with configured percentage, enabled state, and actual CPU/GiB deduction.

Policy version 4 replaces the earlier four-vCPU etcd 2+2 rule with six-vCPU etcd 3+3. Every node reserves three cores even without etcd. Older affinity-enabled scenarios repack within their saved AZs; configured VM sizes are retained, so four-vCPU etcd or 22-vCPU workers may become unplaced until their profiles are edited. Off-mode legacy placements are preserved when maintenance exclusions permit. Master/ingress pairing remains optional; the 6+10 combination can share one 21-core budget, preserving another node for a worker.
