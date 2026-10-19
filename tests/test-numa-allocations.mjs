import {defaults} from './fixtures.mjs';
import assert from 'node:assert/strict';
import {numaPlan} from '../model.mjs';
function example(cpu,memory,extra=0){const s=defaults();s.affinityEnabled=false;s.clusters=s.clusters.slice(0,1);s.clusters[0].profiles.worker={cpu,memory,count:1};s.vms=[{id:'test',clusterId:'k8s-1',type:'worker',az:0,host:0}];if(extra)s.vms.push({id:'extra',clusterId:'k8s-1',type:'worker',az:0,host:0});return numaPlan(s,0,0);}
for(const [cpu,memory,extra] of [[12,120,0],[32,120,0],[12,400,0],[80,800,0],[12,200,1]]){const plan=example(cpu,memory,extra);for(const p of plan.placements.values()){assert.equal(p.cpuByNode.reduce((a,b)=>a+b,0),cpu);assert.equal(p.memoryByNode.reduce((a,b)=>a+b,0),memory);}for(const n of plan.nodes){assert.equal(n.cpu,[...plan.placements.values()].reduce((sum,p)=>sum+p.cpuByNode[n.id],0));assert.equal(n.memory,[...plan.placements.values()].reduce((sum,p)=>sum+p.memoryByNode[n.id],0));}}
assert.equal(example(12,120).placements.get('test').nodes.length,1);
assert.equal(example(32,120).placements.get('test').nodes.length,2);
assert.ok(example(12,400).placements.get('test').memoryByNode.every(n=>n>0));
console.log('PASS: local, CPU spanning, memory spanning, overflow and multiple VMs; per-node allocations reconcile to VM and host totals.');
