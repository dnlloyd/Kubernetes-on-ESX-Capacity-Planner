import assert from 'node:assert/strict';
import {defaults,usage,hostUsage} from '../model.mjs';
const s=defaults();s.host={...s.host,cpu:96,coresPerSocket:24,memory:768};s.hosts=[35,34,34];
assert.deepEqual([0,1,2].map(az=>usage(s,az).capacity),[{cpu:3264,memory:26112},{cpu:3168,memory:25344},{cpu:3168,memory:25344}]);
assert.equal([0,1,2].reduce((n,az)=>n+usage(s,az).capacity.cpu,0),9600);
s.hosts=[1,2,3];assert.deepEqual(usage(s,0).capacity,{cpu:0,memory:0});assert.equal(usage(s,0).over,false);
s.vms=[{clusterId:'k8s-1',type:'worker',az:0,host:0}];assert.equal(usage(s,0).over,true);assert.equal(hostUsage(s,0,0).capacity.cpu,96);
s.hosts[0]=2;s.vms=Array.from({length:9},()=>({clusterId:'k8s-1',type:'worker',az:0,host:0}));assert.equal(usage(s,0).over,true);
console.log('PASS: one host reserved per AZ; region sum; zero capacity; warnings; individual host capacity unchanged.');
