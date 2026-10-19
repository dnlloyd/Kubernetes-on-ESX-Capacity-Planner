import assert from 'node:assert/strict';
import {defaults,defaultCluster,logicalCores,reconcile,distribute,normalizeState,validateState,assignHosts,clientCapacity,defaultDeductions} from '../model.mjs';
import {defaults as fixtureDefaults} from './fixtures.mjs';
const c=defaults();assert.equal(c.affinityEnabled,false);assert.deepEqual(c.host,{cpu:96,memory:768,sockets:2,coresPerSocket:24,numaNodes:2,hyperthreading:true});assert.equal(logicalCores(c.host),96);assert.deepEqual(c.hosts,[4,4,4]);assert.equal(c.clusters.length,1);
assert.deepEqual(c.clusters[0].profiles,{etcd:{count:5,cpu:4,memory:16},master:{count:3,cpu:6,memory:32},ingress:{count:3,cpu:6,memory:16},worker:{count:6,cpu:12,memory:60}});
assert.deepEqual(defaultCluster('k8s-2','New cluster').profiles,c.clusters[0].profiles);
assert.deepEqual(defaultDeductions(),{nodeCpu:0.5,nodeMemoryGiB:8.5,servicesCpu:60,servicesMemoryGiB:250});
const s=distribute(reconcile(c));validateState(s);assert.equal(s.vms.length,17);assert.ok(s.vms.every(v=>v.host!==null));const on=assignHosts({...s,affinityEnabled:true});assert.equal(on.vms.filter(v=>v.host===null).length,0);assert.equal(normalizeState(on).affinityEnabled,true);assert.deepEqual(normalizeState(s),s);
// Changing new-scenario defaults never replaces saved profiles or topology.
const old=distribute(reconcile(fixtureDefaults()));assert.deepEqual(normalizeState(old),old);
console.log('PASS: requested defaults, calculated logical CPU, single-cluster profiles, strict placement and saved-scenario preservation.');

const budget=clientCapacity(s,'k8s-1');assert.equal(budget.cpu,9);assert.equal(budget.nodeMemoryGiB,51);assert.ok(Math.abs(budget.memoryGiB-(360*1e9/2**30-51-250))<1e-8);
