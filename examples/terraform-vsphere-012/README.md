# Terraform affinity concept example

Read [main.tf](main.tf) from top to bottom. It contains the Terraform/provider settings, six inventory inputs, four VM resource blocks and three explicit affinity rules. No modules, role maps or generated rule lists are involved.

The example represents **AZ1 with four etcd VMs from two Kubernetes clusters**: `cluster1-etcd1`, `cluster1-etcd2`, `cluster2-etcd1`, and `cluster2-etcd2`. The other resource blocks illustrate two masters, two ingress and two workers from cluster1 only. This is not a complete region deployment.

The full etcd distribution is:

| AZ | Cluster 1 | Cluster 2 | Total |
| --- | --- | --- | --- |
| AZ1 (implemented here) | etcd1, etcd2 | etcd1, etcd2 | 4 |
| AZ2 | etcd3, etcd4 | etcd3, etcd4 | 4 |
| AZ3 | etcd5 | etcd5 | 2 |

AZ1 and AZ2 each require at least four eligible ESX hosts for these etcd VMs. All four AZ1 etcd VMs are members of the same mandatory anti-affinity rule. Each retains six vCPUs and the same 3+3 NUMA settings.

| Resource | What it demonstrates |
| --- | --- |
| `etcd` | Six vCPUs, requested 3+3 virtual NUMA topology, mapping each virtual node to a different physical node |
| `master` | Six-vCPU virtual NUMA node; ESXi chooses physical placement |
| `ingress` | Ten-vCPU virtual NUMA node; ESXi chooses physical placement, independently of masters |
| `worker` | Twenty-one-vCPU virtual NUMA node; ESXi chooses physical placement |
| `all_etcd_separate` | Every listed etcd VM must use a different ESX host |
| `masters_separate` | Masters of this Kubernetes cluster must use different ESX hosts |
| `ingress_separate` | Ingress VMs of this Kubernetes cluster must use different ESX hosts |

Each rule lists its VM resources directly. The shared etcd rule already includes VMs from both Kubernetes clusters. When extending the other role examples to cluster2, create separate master and ingress rules for that cluster. Additional etcd VMs in this AZ must join the same shared etcd rule. There is no worker separation rule or required master/ingress pair. Keep the explicit rule membership lists aligned with changes to VM counts. Repeat the concept independently for AZ2 and AZ3.

## Version and NUMA assumptions

The example retains Terraform `~> 0.12.0` and pins provider `1.15.0`, a reproducible version inside your `< 1.16.0` range. Your constraint allows older providers too, but these DRS resources were introduced in [provider 1.5.0](https://github.com/vmware/terraform-provider-vsphere/blob/v1.15.0/CHANGELOG.md).

The active `sched.node0.affinity` and `sched.node1.affinity` settings assume an SME-approved **ESXi 7.0 U2 or later** build; [Broadcom documents that version dependency](https://knowledge.broadcom.com/external/article?legacyId=78094). An old provider accepting these strings does not establish server compatibility. Two physical NUMA nodes, numbered consistently 0 and 1, with 24 physical cores each are assumed on every eligible host.

Masters, ingress and workers have no physical NUMA node affinity; ESXi chooses their physical placement. Etcd retains both its 3+3 virtual topology and explicit per-node physical mapping. These settings do not select an ESX host or guarantee complementary VMs will land together. DRS can still co-locate VMs whose combined CPU or RAM exceeds a node's planning budget. Enforcing the planner's reserved three cores, memory allowance and complete packing policy needs a separate placement/admission check. Virtual topology alone also does not guarantee half the RAM is physically local on each node. Verify effective CPU topology, memory locality and vMotion behavior on the actual hosts.

## Trying the example

Supply the six inventory IDs declared near the top, through your usual Terraform inputs. They must describe the same AZ, with a resource pool belonging to its ESX cluster. Set the connection with `VSPHERE_SERVER`, `VSPHERE_USER` and `VSPHERE_PASSWORD`; TLS verification stays enabled. Adapt the single-disk template, guest ID, disk/controller layout and network to your environment. The provider's [VM documentation](https://github.com/vmware/terraform-provider-vsphere/blob/v1.15.0/website/docs/r/virtual_machine.html.markdown) includes an `extra_config` caveat for OVF/OVA templates.

```text
terraform init
terraform validate
terraform plan
```

Merge VM attributes into the resources that already own your VMs rather than declaring duplicate ownership. NUMA changes require a planned cold power cycle and verification. Rules reference VMs that must exist first, so review initial provisioning/power-on sequencing as well as later DRS operation. Mandatory rules can prevent placement when constraints cannot be satisfied; review their interaction with HA and vMotion. The provider describes the rule arguments in its [1.15.0 anti-affinity documentation](https://github.com/vmware/terraform-provider-vsphere/blob/v1.15.0/website/docs/r/compute_cluster_vm_anti_affinity_rule.html.markdown).

Checked with Terraform **0.12.29** and provider **1.15.0**: `terraform validate` and formatting passed. Validation used dummy credentials and did not connect to vCenter. No infrastructure plan or apply was run.
