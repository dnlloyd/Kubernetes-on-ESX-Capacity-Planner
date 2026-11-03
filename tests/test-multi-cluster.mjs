import assert from 'node:assert/strict';
import {defaults,defaultCluster,reconcile,distribute,normalizeState,validateConfig,validateState,clientCapacity,clusterCapacity,capacityCsv,affinityPlan,hostUsage} from '../model.mjs';
assert.equal(defaults().clusters.length,1);
for(const affinityEnabled of [true,false]){
 const c=defaults();c.affinityEnabled=affinityEnabled;c.hosts=[12,12,12];c.kubernetesReserve.enabled=false;
 c.clusters=Array.from({length:6},(_,i)=>{
  const cluster=defaultCluster(`k8s-many-${i+1}`,`Team ${i+1}`);
  for(const type of ['etcd','master','ingress'])cluster.profiles[type].count=1;
  cluster.profiles.worker={count:2,cpu:21,memory:60+i};
  cluster.deductions={nodeCpu:0.5+i/10,nodeMemoryGiB:8.5+i,servicesCpu:i+1,servicesMemoryGiB:(i+1)*10};
  return cluster;
 });
 const s=distribute(reconcile(c)),before=JSON.stringify(s);validateState(s);
 assert.equal(s.clusters.length,6);assert.equal(s.vms.length,30);assert.ok(s.vms.every(v=>v.host!==null));
 for(const cluster of s.clusters){const capacity=clientCapacity(s,cluster.id);assert.equal(capacity.placed,2);assert.equal(capacity.cpu,42-2*cluster.deductions.nodeCpu-cluster.deductions.servicesCpu);assert.equal(clusterCapacity(s,cluster.id).count,5);}
 const csv=capacityCsv(s);for(const cluster of s.clusters)assert.ok(csv.includes(`"${cluster.label}"`));
 assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(s))),s);assert.equal(JSON.stringify(s),before);
 if(affinityEnabled)for(let az=0;az<3;az++)for(let host=0;host<12;host++)assert.ok(affinityPlan(s,hostUsage(s,az,host).vms).fits);
 const updated=structuredClone(c);updated.clusters[2].profiles.worker.count=3;const next=reconcile(updated,s.vms);assert.equal(clusterCapacity(next,c.clusters[2].id).count,6);assert.equal(clusterCapacity(next,c.clusters[5].id).count,5);
 const duplicate=structuredClone(c);duplicate.clusters[5].id=duplicate.clusters[0].id;assert.throws(()=>validateConfig(duplicate),/unique/);
 assert.throws(()=>validateConfig({...c,clusters:[]}),/at least one/);
 const excessive=structuredClone(c);excessive.clusters[0].profiles.worker.count=3001;assert.throws(()=>validateConfig(excessive),/3,000/);
}
console.log('PASS: six-cluster placement in both modes, independent profiles/deductions, JSON/CSV, third-cluster edits, validation and unchanged one-cluster default.');
