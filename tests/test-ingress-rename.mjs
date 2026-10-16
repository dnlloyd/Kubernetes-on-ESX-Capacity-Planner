import assert from 'node:assert/strict';
import {defaults,reconcile,distribute,normalizeState,pairedVM,usage,clientCapacity} from '../model.mjs';
for(const affinityEnabled of [true,false]){
 const cfg=defaults();cfg.hosts=[60,60,60];cfg.affinityEnabled=affinityEnabled;
 const current=distribute(reconcile(cfg));
 const legacy=structuredClone(current);
 for(const c of legacy.clusters){c.profiles.public=c.profiles.ingress;delete c.profiles.ingress;}
 for(const v of legacy.vms)if(v.type==='ingress'){v.type='public';v.name=v.name.replace('ingress-','public-');v.id=v.id.replace('ingress-','public-');}
 const original=JSON.stringify(legacy),migrated=normalizeState(legacy);
 assert.deepEqual(migrated,current);assert.equal(JSON.stringify(legacy),original);
 assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(migrated))),current);
 for(let az=0;az<3;az++)assert.deepEqual(usage(migrated,az),usage(current,az));
 assert.deepEqual(clientCapacity(migrated,'k8s-1'),clientCapacity(current,'k8s-1'));
 const ingress=migrated.vms.find(v=>v.type==='ingress');assert.equal(pairedVM(migrated,ingress).type,'master');
}
console.log('PASS: public → ingress migration preserves sizing, VM IDs/placements, affinity, AZ capacity and client budgets; new exports round-trip.');
