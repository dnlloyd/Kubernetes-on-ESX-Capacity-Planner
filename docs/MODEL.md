# Model assumptions and calculations

## Topology and CPU

Exactly three AZs represent a region. All ESX hosts have identical configured resources. Logical CPUs = sockets × physical cores/socket × (2 if hyperthreading active, otherwise 1). The default sockets value is 2 and hyperthreading is active. NUMA defaults to two nodes total per host, with equal CPU and memory resources; it is not inferred as one node per socket.

VM CPU values represent vCPUs compared directly against logical host CPUs. They are configured allocations, not measured utilization. Physical-core count remains visible and informs the separate NUMA contention heuristic.

## N+1 at ESX level

AZ CPU capacity = max(host count − 1, 0) × host logical CPUs.
AZ memory capacity = max(host count − 1, 0) × host memory GB.
Region totals sum these reduced AZ capacities. Percentage bars and aggregate capacity warnings use these capacities. All hosts remain available in the normal placement display; the model does not evacuate a host or guarantee affinity feasibility during an outage. Individual host and NUMA capacity are not reduced by N+1.

## Kubernetes profiles

One or two labeled Kubernetes clusters. Each has etcd, master, ingress, and worker profiles. VMs of a type within a cluster have homogeneous resources; cluster profiles may differ. Counts may be zero. The app's example starts with two clusters, each containing 5 etcd (4 CPU/16 GB), 3 master (6 CPU/32 GB), 3 ingress (6 CPU/16 GB), and 186 workers (12 CPU/120 GB). These defaults are not the current browser scenario.

## Affinity enabled

The following limits apply across both Kubernetes clusters, per ESX host within an AZ:

- At most one etcd VM; it may coexist with other types.
- Matching master and ingress node numbers within the same Kubernetes cluster form a pair, sharing AZ and host.
- At most one pair per host.
- At most one worker with a pair; otherwise at most two workers.
- A master or ingress without a partner remains unplaced.

Workers are interleaved between Kubernetes clusters when allocating scarce slots. Insufficient placement slots leave VMs visibly unplaced; counts are not discarded. Resource-overcapacity placements are permitted with warnings. Affinity disabled removes pairing and occupancy restrictions and redistributes within current AZs. Enabling restores the rules. No persistent ESX host pinning.

## NUMA view

Planning estimate: largest-memory-first, CPU balancing, equal node resources, full configured RAM. A VM larger than a node's physical-core count is classified as wide for CPU allocation. A smaller VM can still receive remote memory if it cannot fit on the selected home node. Keep CPU spanning and memory spanning distinct.

Node CPU bar = allocated vCPUs / node logical CPUs; memory bar = allocated GB / node GB. Physical-core contention may be flagged below 100% of the logical CPU bar. Green means local fit under the heuristic; amber signals memory/CPU risk; blue marks wide CPU placement. These are not measured performance or ESXi decisions. Do not fabricate NHN, N%L, or actual memory locality.

## Workload budget and units

Existing VM/host memory inputs are treated as **decimal GB**. This was explicitly discussed with the user and has not been changed to GiB. Workload budgets use GiB:

- Gross CPU = placed workers × worker CPU.
- Gross memory GiB = placed workers × worker memory GB × 1,000,000,000 / 1,073,741,824.
- Client CPU = max(gross CPU − placed workers × node CPU reserve − cluster-service CPU, 0).
- Client memory GiB = max(gross GiB − placed workers × node memory reserve GiB − cluster-service GiB, 0).

Only placed workers contribute. Etcd/master/ingress and unplaced workers do not. The configured VM totals section includes all configured VMs, including unplaced demand, and uses GB. No extra ESX N+1 deduction applies to the worker budget.

Default deductions, independently editable per Kubernetes cluster:

- Node CPU: 12 Capacity − 11.5 Allocatable = 0.5 vCPU per worker.
- Node memory: (92,677,260 KiB × 1,024 − 85,861,471,162 bytes) / 1,073,741,824 = approximately 8.419196 GiB per worker.
- Cluster services: fixed 56.295 CPU and 244.075 GiB once per Kubernetes cluster, from the user's worker-only namespace snapshot covering 1,577/1,577 matching pods.

The same service snapshot is initially reused for both clusters. It is not scaled by worker count. Values are a baseline, not peak demand or Kubernetes requests. Node reservations are assumed constant at other worker sizes. Budgets are before existing client consumption. No extra growth or pod-request headroom is included. Excessive deductions clamp the result to zero and produce a warning.
