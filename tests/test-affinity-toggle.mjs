import assert from 'node:assert/strict';
import {defaults,reconcile,assignHosts,distribute,normalizeState,validateState,pairedVM,hostUsage,numaPlan} from '../model.mjs';
const cfg=defaults();cfg.hosts=[35,34,34];cfg.host={...cfg.host,cpu:96,coresPerSocket:24,memory:768};cfg.clusters[1].profiles.worker.count=114;
const on=distribute(reconcile(cfg));assert.equal(on.vms.filter(v=>v.host===null).length,100);
const off=assignHosts({...on,affinityEnabled:false});validateState(off);assert.equal(off.vms.filter(v=>v.host===null).length,0);assert.deepEqual(off.vms.map(v=>v.az),on.vms.map(v=>v.az));assert.deepEqual(off.host,on.host);assert.deepEqual(off.clusters,on.clusters);
assert.ok(Array.from({length:35},(_,h)=>hostUsage(off,0,h).vms.filter(v=>v.type==='worker').length).some(n=>n>2));
assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(off))),off);
const moved=structuredClone(off),master=moved.vms.find(v=>v.type==='master');master.az=(master.az+1)%3;const mate=pairedVM(moved,master);const ingressAZ=mate.az;
const offMoved=assignHosts(moved);validateState(offMoved);assert.equal(pairedVM(offMoved,offMoved.vms.find(v=>v.id===master.id)).az,ingressAZ);
const restored=assignHosts({...off,affinityEnabled:true});validateState(restored);assert.deepEqual(restored,on);
const onMoved=assignHosts({...offMoved,affinityEnabled:true});validateState(onMoved);assert.equal(pairedVM(onMoved,onMoved.vms.find(v=>v.id===master.id)).az,master.az);
const old=structuredClone(on);delete old.affinityEnabled;assert.equal(normalizeState(old).affinityEnabled,true);
assert.throws(()=>normalizeState({...off,affinityEnabled:'false'}),/on or off/);
for(const enabled of [true,false]){const s=distribute({...off,affinityEnabled:enabled});validateState(s);assert.equal(s.affinityEnabled,enabled);for(let az=0;az<3;az++)numaPlan(s,az,0);}
console.log('PASS: toggle restores 100 unplaced/all placed, independent AZ moves off, pair reunion on, on/off redistribution and NUMA, persistence, legacy default, invalid values.');
