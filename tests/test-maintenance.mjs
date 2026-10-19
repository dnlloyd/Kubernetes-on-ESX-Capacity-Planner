import {defaults} from './fixtures.mjs';
import assert from 'node:assert/strict';
import {reconcile,assignHosts,distribute,normalizeState,validateState,hostUsage,usage,clientCapacity,isMaintenanceHost} from '../model.mjs';
for(const affinityEnabled of [true,false]){
  const c=defaults();c.affinityEnabled=affinityEnabled;c.hosts=[2,3,4];c.clusters=c.clusters.slice(0,1);
  for(const t of Object.keys(c.clusters[0].profiles))c.clusters[0].profiles[t].count=0;
  c.clusters[0].profiles.worker={count:9,cpu:12,memory:32};
  const s=distribute(reconcile(c));validateState(s);
  assert.ok(s.vms.every(v=>v.host===null||!isMaintenanceHost(s,v.az,v.host)));
  for(let az=0;az<3;az++){
    assert.equal(hostUsage(s,az,s.hosts[az]-1).vms.length,0);
    assert.equal(usage(s,az).capacity.memory,(s.hosts[az]-1)*s.host.memory);
  }
  assert.deepEqual(assignHosts(s),s);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(s))),s);
  // Previous policy saves may use the last host; repack, preserving scenario data.
  const old=structuredClone(s);old.placementPolicyVersion=2;
  old.vms.forEach(v=>v.host=old.hosts[v.az]-1);
  const migrated=normalizeState(old);validateState(migrated);
  assert.deepEqual(migrated.clusters,s.clusters);
  assert.deepEqual(migrated.vms.map(v=>[v.id,v.az]),s.vms.map(v=>[v.id,v.az]));
  assert.ok(migrated.vms.every(v=>v.host===null||!isMaintenanceHost(migrated,v.az,v.host)));
  const invalid=structuredClone(s);invalid.vms[0].host=invalid.hosts[invalid.vms[0].az]-1;
  assert.throws(()=>validateState(invalid),/reserved for maintenance/);
  assert.throws(()=>normalizeState(invalid),/reserved for maintenance/);
  old.vms[0].id='bad';assert.throws(()=>normalizeState(old),/invalid/);
  const single=assignHosts({...s,hosts:[1,1,1]});validateState(single);
  assert.ok(single.vms.every(v=>v.host===null));
  assert.equal(clientCapacity(single,'k8s-1').placed,0);
  assert.equal(clientCapacity(single,'k8s-1').grossCpu,0);
}
// A valid prior off-mode save that already leaves the reserve free keeps its assignments.
const off=defaults();off.affinityEnabled=false;const safe=reconcile(off);safe.placementPolicyVersion=2;
assert.deepEqual(normalizeState(safe).vms,safe.vms);
console.log('PASS: maintenance reservation in both modes, zero eligible hosts, capacity accounting, validation, migration and round trips.');
