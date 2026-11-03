import assert from 'node:assert/strict';
import {defaults,reconcile,distribute,assignHosts,normalizeState,validateConfig,validateState,usage,hostUsage,isMaintenanceHost,availableHostCount,reservedHostCount,vmMobility,clientCapacity} from '../model.mjs';
for(const affinityEnabled of [true,false]){
  const c=defaults();c.affinityEnabled=affinityEnabled;c.maintenanceReserve=2;
  const s=distribute(reconcile(c));validateState(s);
  assert.equal(s.maintenanceReserve,2);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(s))),s);
  for(let az=0;az<3;az++){
    assert.equal(availableHostCount(s,az),2);
    assert.deepEqual(usage(s,az).capacity,{cpu:192,memory:1536});
    for(const host of [2,3]){assert.ok(isMaintenanceHost(s,az,host));assert.equal(hostUsage(s,az,host).vms.length,0);}
    assert.ok(!isMaintenanceHost(s,az,0));assert.ok(!isMaintenanceHost(s,az,null));assert.ok(!isMaintenanceHost(s,az,4));
  }
  assert.ok(s.vms.every(v=>v.host===null||v.host<2));
  for(const row of vmMobility(s)){
    assert.deepEqual(row.maintenanceHosts,[2,3]);
    assert.ok(row.eligibleHosts.every(h=>h<2));
    if(row.source!==null)assert.equal(row.rejected.filter(r=>r.reason.startsWith('Maintenance mode')).length,2);
  }
  const invalid=structuredClone(s);invalid.vms.find(v=>v.host!==null).host=2;assert.throws(()=>validateState(invalid),/reserved for maintenance/);
  const all=assignHosts({...s,maintenanceReserve:4});validateState(all);assert.ok(all.vms.every(v=>v.host===null));assert.equal(usage(all,0).capacity.cpu,0);assert.equal(clientCapacity(all,'k8s-1').placed,0);
  const one=assignHosts({...s,maintenanceReserve:1});
  assert.deepEqual(s.vms.map(v=>[v.id,v.az]),one.vms.map(v=>[v.id,v.az]));
  if(!affinityEnabled)assert.deepEqual(clientCapacity(s,'k8s-1'),clientCapacity(one,'k8s-1'));
}
const c=defaults();for(const reserve of [0,-1,1.5,'2',null,NaN,5])assert.throws(()=>validateConfig({...c,maintenanceReserve:reserve}),/Reserved ESX hosts/);
const legacy=distribute(reconcile(c));delete legacy.maintenanceReserve;const restored=normalizeState(legacy);assert.equal(restored.maintenanceReserve,1);assert.deepEqual(restored.vms,legacy.vms);assert.equal(reservedHostCount(legacy),1);
assert.equal(normalizeState({...restored,maintenanceReserve:2,vms:assignHosts({...restored,maintenanceReserve:2}).vms}).maintenanceReserve,2);
console.log('PASS: configurable N+2 capacity, scheduling and mobility exclusions, both modes, all-host reserve, validation, legacy defaults and JSON restoration.');
