import assert from 'node:assert/strict';
import {defaults,reconcile,assignHosts,normalizeState,validateState,numaPlan,affinityPlan,hostUsage} from '../model.mjs';
function scenario(profiles,hosts=4){const c=defaults();c.affinityEnabled=true;c.clusters=c.clusters.slice(0,1);c.hosts=[hosts+1,hosts+1,hosts+1];c.host={...c.host,cpu:96,coresPerSocket:24,memory:768};for(const t of Object.keys(c.clusters[0].profiles))c.clusters[0].profiles[t].count=0;for(const [t,p] of Object.entries(profiles))c.clusters[0].profiles[t]={...c.clusters[0].profiles[t],...p};const s=reconcile(c);s.vms.forEach(v=>v.az=0);return assignHosts(s);}
const sme=scenario({worker:{count:66,cpu:22,memory:120},master:{count:2,cpu:8},ingress:{count:2,cpu:8},etcd:{count:5}},34);
validateState(sme);assert.equal(sme.vms.filter(v=>v.host===null).length,0);
for(let h=0;h<34;h++){const p=numaPlan(sme,0,h);assert.ok(p.fits);for(const n of p.nodes){assert.ok(n.cpu<=24);assert.ok(n.memory<=345.6+1e-8);}for(const v of hostUsage(sme,0,h).vms){const x=p.placements.get(v.id);if(v.type==='etcd'){assert.deepEqual(x.cpuByNode,[2,2]);assert.deepEqual(x.memoryByNode,[8,8]);}else assert.equal(x.nodes.length,1);}}
assert.deepEqual(assignHosts(sme),sme);assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(sme))),sme);
// Different numeric suffixes may share; unmatched roles do not depend on partners.
const standalone=scenario({master:{count:2,cpu:8},ingress:{count:1,cpu:8},worker:{count:2,cpu:22},etcd:{count:2}},3);
assert.ok(standalone.vms.every(v=>v.host!==null));validateState(standalone);
const master=standalone.vms.find(v=>v.type==='master'),ingress=standalone.vms.find(v=>v.type==='ingress');
const otherMaster=standalone.vms.filter(v=>v.type==='master')[1];assert.ok(affinityPlan(standalone,[otherMaster,ingress]).fits);
assert.ok(!affinityPlan(standalone,[master,otherMaster]).fits);
assert.ok(affinityPlan(standalone,[master,standalone.vms.find(v=>v.type==='worker'),standalone.vms.find(v=>v.type==='etcd')]).fits);
const oversized=scenario({worker:{count:1,cpu:23}},1);assert.equal(oversized.vms[0].host,null);
const memory=scenario({worker:{count:1,cpu:12,memory:340},etcd:{count:1}},1);assert.equal(memory.vms.find(v=>v.type==='worker').host,null);
// No artificial two-worker cap: four small workers fit the two node budgets.
const small=scenario({worker:{count:4,cpu:8,memory:32}},1);assert.ok(small.vms.every(v=>v.host===0));
const unsupported=scenario({etcd:{count:1,cpu:6}},1);assert.equal(unsupported.vms[0].host,null);
const invalid=structuredClone(standalone);invalid.vms.filter(v=>v.type==='master').forEach(v=>v.host=0);assert.throws(()=>validateState(invalid),/affinity/);
// Old saved policy is structurally validated and repacked, retaining IDs, AZs and profiles.
const legacy=structuredClone(sme);delete legacy.placementPolicyVersion;legacy.vms.forEach(v=>v.host=0);const migrated=normalizeState(legacy);validateState(migrated);assert.deepEqual(migrated.vms.map(v=>[v.id,v.az]),sme.vms.map(v=>[v.id,v.az]));assert.deepEqual(migrated.clusters,sme.clusters);
const malformed=structuredClone(legacy);malformed.vms[0].id='bad';assert.throws(()=>normalizeState(malformed),/invalid/);
console.log('PASS: SME 66-worker/34-host layout; etcd 2+2, CPU/memory reserves, independent roles, role separation, strict fit, small workers, migration and invalid scenario rejection.');

// Different clusters may share the same role on a host; etcd remains globally separated.
const shared=structuredClone(standalone);const second=structuredClone(shared.clusters[0]);second.id='k8s-2';shared.clusters.push(second);
const secondMaster={...master,id:'k8s-2:master-01',clusterId:'k8s-2'};
assert.ok(affinityPlan(shared,[master,secondMaster]).fits);
const e=standalone.vms.find(v=>v.type==='etcd');assert.ok(!affinityPlan(shared,[e,{...e,id:'k8s-2:etcd-01',clusterId:'k8s-2'}]).fits);
const noEtcd=structuredClone(standalone);noEtcd.clusters[0].profiles.etcd.count=0;const slot=affinityPlan(noEtcd,[]);assert.equal(slot.cpuBudget,22);assert.equal(slot.memoryReserve,0);
const larger=structuredClone(shared);larger.clusters[1].profiles.etcd.memory=32;assert.equal(affinityPlan(larger,[]).memoryReserve,16);
// Off-mode legacy saves retain manual host assignments exactly.
const oldOff=assignHosts({...standalone,affinityEnabled:false});delete oldOff.placementPolicyVersion;
oldOff.vms.forEach(v=>v.host=2);const restoredOff=normalizeState(oldOff);assert.ok(restoredOff.vms.every(v=>v.host===2));
console.log('PASS: per-cluster role separation, global etcd separation, reserve accounting and off-mode placement preservation.');

// Sparse regions spread every role before stacking VMs onto already-busy hosts.
const sparse=scenario({worker:{count:22,cpu:22,memory:120},master:{count:1,cpu:8},ingress:{count:1,cpu:8},etcd:{count:2}},35);
validateState(sparse);
assert.equal(new Set(sparse.vms.map(v=>v.host)).size,26);
assert.ok(sparse.vms.every(v=>v.host!==null));
assert.deepEqual(assignHosts(sparse),sparse);
assert.deepEqual(sparse.vms.map(v=>[v.id,v.az]),assignHosts(sparse).vms.map(v=>[v.id,v.az]));
// Memory pressure participates in the ranking, not just CPU or VM count.
const mixed=scenario({worker:{count:2,cpu:8,memory:300},master:{count:1,cpu:8,memory:16},ingress:{count:1,cpu:8,memory:16}},3);
const mixedHosts=Array.from({length:3},(_,h)=>hostUsage(mixed,0,h));
assert.ok(mixedHosts.every(h=>h.vms.length>0));
assert.equal(mixedHosts.find(h=>h.vms.some(v=>v.type==='master')).memory,32);
validateState(mixed);
console.log('PASS: sparse all-role spreading, memory-aware balancing, deterministic rebalance and unchanged AZ membership.');
