import assert from 'node:assert/strict';
import {defaults,defaultCluster,reconcile,distribute,clientCapacity,capacityCsv,normalizeState,validateConfig,usage,kubernetesReserveSettings} from '../model.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const c=defaults();c.hosts=[80,80,80];c.clusters[0].profiles.worker={count:180,cpu:22,memory:160};
c.clusters.push(defaultCluster('k8s-2','Second cluster'));c.clusters[1].profiles.worker={count:60,cpu:22,memory:60};
const s=distribute(reconcile(c)),original=JSON.stringify(s);
for(const cluster of s.clusters){
 const on=clientCapacity(s,cluster.id),off=clientCapacity({...s,kubernetesReserve:{enabled:false,percent:100/6}},cluster.id);
 close(on.kubernetesReserveCpu,on.allocatableCpu/6);close(on.kubernetesReserveMemoryGiB,on.allocatableMemoryGiB/6);
 close(on.cpu,Math.max(0,on.allocatableCpu*5/6-cluster.deductions.servicesCpu));
 close(on.memoryGiB,Math.max(0,on.allocatableMemoryGiB*5/6-cluster.deductions.servicesMemoryGiB));
 close(off.kubernetesReserveCpu,0);close(off.cpu,off.allocatableCpu-cluster.deductions.servicesCpu);
 close(off.memoryGiB,off.allocatableMemoryGiB-cluster.deductions.servicesMemoryGiB);
 const quarter=clientCapacity({...s,kubernetesReserve:{enabled:true,percent:25}},cluster.id);close(quarter.kubernetesReserveCpu,on.allocatableCpu/4);
 const zero=clientCapacity({...s,kubernetesReserve:{enabled:true,percent:0}},cluster.id);close(zero.cpu,off.cpu);close(zero.memoryGiB,off.memoryGiB);
 const full=clientCapacity({...s,kubernetesReserve:{enabled:true,percent:100}},cluster.id);assert.equal(full.cpu,0);assert.equal(full.memoryGiB,0);assert.ok(full.overdrawn);
}
assert.equal(JSON.stringify(s),original);
// Percentage changes never change ESX capacity or the number/placement of worker VMs.
const off={...s,kubernetesReserve:{enabled:false,percent:27.5}};assert.deepEqual(usage(s,0),usage(off,0));assert.deepEqual(s.vms,off.vms);
assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(off))),off);
assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(s))),s);
const old=structuredClone(off);delete old.kubernetesReserve;const restored=normalizeState(old);assert.deepEqual(restored.kubernetesReserve,{enabled:true,percent:100/6});assert.deepEqual(restored.vms,old.vms);assert.deepEqual(restored.clusters,old.clusters);
assert.equal(kubernetesReserveSettings(old).enabled,true);
for(const reserve of [null,{},false,{enabled:'true',percent:10},{enabled:true,percent:-1},{enabled:true,percent:101},{enabled:false,percent:NaN},{enabled:true,percent:'20'}])assert.throws(()=>validateConfig({...s,kubernetesReserve:reserve}),/Kubernetes capacity reserve/);
const csv=capacityCsv(s);assert.ok(csv.includes('Kubernetes capacity reserve (16.666667%, on)'));assert.ok(csv.includes(',645,'));assert.ok(capacityCsv(off).includes('Kubernetes capacity reserve (27.5%, off)'));
// Unplaced workers and profiles with excessive node reserves cannot inflate the deduction.
const missing=structuredClone(s);missing.vms.filter(v=>v.clusterId==='k8s-1'&&v.type==='worker').forEach(v=>v.host=null);const none=clientCapacity(missing,'k8s-1');assert.equal(none.kubernetesReserveCpu,0);assert.equal(none.kubernetesReserveMemoryGiB,0);assert.equal(none.cpu,0);
const excessive=structuredClone(s);excessive.clusters[0].deductions.nodeCpu=100;assert.equal(clientCapacity(excessive,'k8s-1').kubernetesReserveCpu,0);
console.log('PASS: exact 1/6 default, CPU/memory order and fixed platform budget, both clusters, on/off, custom percentages, validation, migration, JSON/CSV and unchanged placements.');
