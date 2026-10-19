import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {defaults,reconcile,assignHosts,vmMobility,isMaintenanceHost} from '../model.mjs';
function scenario(counts,hosts=4){const c=defaults();c.affinityEnabled=true;c.clusters=c.clusters.slice(0,1);c.hosts=[hosts,hosts,hosts];c.host={...c.host,cpu:96,coresPerSocket:24,memory:768};for(const t of Object.keys(c.clusters[0].profiles))c.clusters[0].profiles[t].count=0;for(const [t,p] of Object.entries(counts))c.clusters[0].profiles[t]={...c.clusters[0].profiles[t],...p};const s=reconcile(c);s.vms.forEach(v=>v.az=0);return assignHosts(s);}
const sparse=scenario({worker:{count:1,cpu:22,memory:120}}),before=JSON.stringify(sparse),rows=[...vmMobility(sparse)];
assert.equal(rows[0].status,'movable');assert.deepEqual(rows[0].eligibleHosts,[1,2]);assert.deepEqual(rows[0].rejected,[{host:3,reason:'Maintenance mode — scheduling prohibited'}]);assert.equal(JSON.stringify(sparse),before);
const limited=scenario({worker:{count:1,cpu:22}},3);assert.equal([...vmMobility(limited)][0].status,'limited');
const blocked=scenario({worker:{count:4,cpu:22,memory:120}},3);const blockedRows=[...vmMobility(blocked)];assert.ok(blockedRows.every(r=>r.status==='blocked'));assert.ok(blockedRows.every(r=>r.rejected.some(d=>d.reason.startsWith('NUMA CPU/memory'))));
const pets=scenario({etcd:{count:2},master:{count:2,cpu:8}},4);const petRows=[...vmMobility(pets)];assert.ok(petRows.filter(r=>r.name.startsWith('etcd')).every(r=>r.rejected.some(d=>d.reason.includes('one etcd'))));assert.ok(petRows.filter(r=>r.name.startsWith('master')).every(r=>r.rejected.some(d=>d.reason.includes('one master'))));
for(const enabled of [true,false]){
 const s=assignHosts({...blocked,affinityEnabled:enabled});
 assert.ok(s.vms.every(v=>v.host===null||!isMaintenanceHost(s,v.az,v.host)));
 for(const r of vmMobility(s)){assert.ok(!r.eligibleHosts.includes(s.hosts[r.az]-1));assert.ok(!r.eligibleHosts.includes(r.source));}
}
const off=assignHosts({...blocked,affinityEnabled:false});off.vms.forEach(v=>v.host=0);off.clusters[0].profiles.worker.cpu=32;
const offRows=[...vmMobility(off)];assert.ok(offRows.every(r=>r.status==='limited'));
off.vms[0].host=1;assert.ok([...vmMobility(off)][0].rejected.some(r=>r.reason==='Host CPU capacity exceeded'));
off.host.cpu=1000;off.clusters[0].profiles.worker.memory=300;assert.ok([...vmMobility(off)][0].rejected.some(r=>r.reason==='Host memory capacity exceeded'));
const empty=assignHosts({...sparse,hosts:[1,1,1]});assert.equal([...vmMobility(empty)][0].status,'unplaced');assert.deepEqual([...vmMobility(empty)][0].eligibleHosts,[]);
// Each destination stays in the source AZ, including hosts occupied by a different cluster.
const multi=structuredClone(sparse);const cluster=structuredClone(multi.clusters[0]);cluster.id='k8s-2';multi.clusters.push(cluster);const other={...multi.vms[0],id:'k8s-2:worker-01',clusterId:'k8s-2',az:1,host:1};multi.vms.push(other);const multiRows=[...vmMobility(multi)];assert.equal(multiRows[1].az,1);assert.ok(!multiRows[1].eligibleHosts.includes(1));
// Run the actual worker entry point and the generated embedded worker with the same fixture.
const model=fs.readFileSync(new URL('../model.mjs',import.meta.url),'utf8').replaceAll('export ','');
const worker=fs.readFileSync(new URL('../mobility-worker.mjs',import.meta.url),'utf8').split('\n').slice(1).join('\n');
const html=fs.readFileSync(new URL('../az-planner.html',import.meta.url),'utf8');
const embedded=html.match(/<script id="mobility-worker-source" type="text\/plain">([\s\S]*?)<\/script>/)[1];
for(const source of [model+'\n'+worker,embedded]){
 const messages=[],self={postMessage:m=>messages.push(m)};vm.runInNewContext(source,{self,structuredClone});self.onmessage({data:sparse});assert.equal(messages.at(-1).type,'complete');assert.equal(JSON.stringify(messages.at(-1).rows),JSON.stringify(rows));assert.ok(messages.some(m=>m.type==='progress'));
}
console.log('PASS: movable/limited/blocked/unplaced, strict NUMA and role checks, off-mode capacity, maintenance exclusion, immutability and both worker entry points.');
