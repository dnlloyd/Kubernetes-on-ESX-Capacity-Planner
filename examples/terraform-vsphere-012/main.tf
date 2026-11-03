# Concept example: AZ1 has four etcd VMs from two Kubernetes clusters.
# Master/ingress/worker resources below illustrate cluster1 only.
# Read top to bottom: connection/inputs, VMs, then three explicit DRS rules.
# Counts are deliberately small to show the rules, not a full regional inventory.
# Assumes vCenter with DRS and two 24-physical-core NUMA nodes per host.
# Active sched.nodeX.affinity settings below require SME-approved ESXi 7.0 U2+.

terraform {
  required_version = "~> 0.12.0"
}

provider "vsphere" {
  # Reproducible example version within the requested < 1.16.0 range.
  version = "= 1.15.0"
  # Use VSPHERE_SERVER, VSPHERE_USER, VSPHERE_PASSWORD for the connection.
}

# Supply IDs from your existing inventory. All resources are in one ESX AZ.
variable "compute_cluster_id" { type = string } # domain-c123
variable "resource_pool_id" { type = string }   # resgroup-123, in that cluster
variable "datastore_id" { type = string }
variable "network_id" { type = string }
variable "template_uuid" { type = string }
variable "guest_id" { type = string }

# ETCD: two VMs from each Kubernetes cluster, all in AZ1.
# Each VM has six vCPUs split into two 3-vCPU nodes.
resource "vsphere_virtual_machine" "etcd" {
  count = 4
  name = [
    "cluster1-etcd1",
    "cluster1-etcd2",
    "cluster2-etcd1",
    "cluster2-etcd2",
  ][count.index]
  resource_pool_id     = var.resource_pool_id
  datastore_id         = var.datastore_id
  guest_id             = var.guest_id
  num_cpus             = 6
  num_cores_per_socket = 3
  memory               = 16384 # 16 GiB
  cpu_hot_add_enabled  = false

  extra_config = {
    # Request two virtual NUMA nodes. Virtual sockets alone do not do this.
    "numa.vcpu.min"               = "6" # Enable vNUMA for this six-vCPU VM
    "numa.vcpu.maxPerVirtualNode" = "3" # Limit each virtual node to three vCPUs

    # Map each vNUMA node to a different physical node on a compatible host.
    # ESXi build support is separate from Terraform/provider version support.
    "sched.node0.affinity" = "0"
    "sched.node1.affinity" = "1"
  }

  network_interface {
    network_id = var.network_id
  }
  disk {
    label = "disk0"
    size  = 40 # Adapt disk/controller layout to the actual template.
  }
  clone {
    template_uuid = var.template_uuid
  }
}

# MASTER: sized to fit one physical NUMA node; ESXi chooses placement.
resource "vsphere_virtual_machine" "master" {
  count                = 2
  name                 = "master-${count.index + 1}"
  resource_pool_id     = var.resource_pool_id
  datastore_id         = var.datastore_id
  guest_id             = var.guest_id
  num_cpus             = 6
  num_cores_per_socket = 6
  memory               = 32768 # 32 GiB
  cpu_hot_add_enabled  = false

  extra_config = {
    "numa.vcpu.min"               = "6"
    "numa.vcpu.maxPerVirtualNode" = "6"
    # ESXi chooses the physical NUMA node.
  }

  network_interface {
    network_id = var.network_id
  }
  disk {
    label = "disk0"
    size  = 40
  }
  clone {
    template_uuid = var.template_uuid
  }
}

# INGRESS: independent of masters; there is no master+ingress pairing rule.
resource "vsphere_virtual_machine" "ingress" {
  count                = 2
  name                 = "ingress-${count.index + 1}"
  resource_pool_id     = var.resource_pool_id
  datastore_id         = var.datastore_id
  guest_id             = var.guest_id
  num_cpus             = 10
  num_cores_per_socket = 10
  memory               = 16384 # 16 GiB
  cpu_hot_add_enabled  = false

  extra_config = {
    "numa.vcpu.min"               = "10"
    "numa.vcpu.maxPerVirtualNode" = "10"
    # ESXi chooses the physical NUMA node.
  }

  network_interface {
    network_id = var.network_id
  }
  disk {
    label = "disk0"
    size  = 40
  }
  clone {
    template_uuid = var.template_uuid
  }
}

# WORKER: 21 vCPUs leaves room for etcd's 3-vCPU share on a 24-core node.
resource "vsphere_virtual_machine" "worker" {
  count                = 2
  name                 = "worker-${count.index + 1}"
  resource_pool_id     = var.resource_pool_id
  datastore_id         = var.datastore_id
  guest_id             = var.guest_id
  num_cpus             = 21
  num_cores_per_socket = 21
  memory               = 61440 # 60 GiB
  cpu_hot_add_enabled  = false

  extra_config = {
    "numa.vcpu.min"               = "21"
    "numa.vcpu.maxPerVirtualNode" = "21"
    # ESXi chooses the physical NUMA node.
  }

  network_interface {
    network_id = var.network_id
  }
  disk {
    label = "disk0"
    size  = 40
  }
  clone {
    template_uuid = var.template_uuid
  }
}

# RULE 1: every etcd VM in this AZ must be on a different ESX host.
# One shared rule covers both Kubernetes clusters, preventing cross-cluster
# etcd co-location too. Four etcd VMs require at least four eligible ESX hosts.
resource "vsphere_compute_cluster_vm_anti_affinity_rule" "all_etcd_separate" {
  name               = "AZ1-all-etcd-separate"
  compute_cluster_id = var.compute_cluster_id
  virtual_machine_ids = [
    vsphere_virtual_machine.etcd[0].id,
    vsphere_virtual_machine.etcd[1].id,
    vsphere_virtual_machine.etcd[2].id,
    vsphere_virtual_machine.etcd[3].id,
  ]
  enabled   = true
  mandatory = true
}

# RULE 2: separate this Kubernetes cluster's masters; another K8s cluster gets its own master rule.
resource "vsphere_compute_cluster_vm_anti_affinity_rule" "masters_separate" {
  name               = "AZ1-masters-separate"
  compute_cluster_id = var.compute_cluster_id
  virtual_machine_ids = [
    vsphere_virtual_machine.master[0].id,
    vsphere_virtual_machine.master[1].id,
  ]
  enabled   = true
  mandatory = true
}

# RULE 3: separate this Kubernetes cluster's ingress; another K8s cluster gets its own ingress rule.
resource "vsphere_compute_cluster_vm_anti_affinity_rule" "ingress_separate" {
  name               = "AZ1-ingress-separate"
  compute_cluster_id = var.compute_cluster_id
  virtual_machine_ids = [
    vsphere_virtual_machine.ingress[0].id,
    vsphere_virtual_machine.ingress[1].id,
  ]
  enabled   = true
  mandatory = true
}

# No worker anti-affinity or master/ingress co-location rule is required.
# These DRS rules do not enforce per-NUMA CPU/RAM budgets. Static node affinity
# above does not stop DRS from co-locating VMs whose combined node budget is too
# large. A placement/admission check is still required for that planner policy.
