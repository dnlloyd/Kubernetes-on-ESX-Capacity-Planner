import assert from 'node:assert/strict';

import {capacityCsv,defaults,reconcile,distribute} from '../model.mjs';
const cfg=defaults();cfg.affinityEnabled=false;cfg.hosts=[35,34,34];cfg.title='HACAS, "Presentation"';cfg.clusters[0].label='Pres-0';cfg.clusters[1].label='Pres-1';cfg.clusters[0].profiles.worker.memory=90;
const s=distribute(reconcile(cfg));const before=JSON.stringify(s),csv=capacityCsv(s);
assert.equal(JSON.stringify(s),before);assert.ok(csv.startsWith('\uFEFF'));assert.equal(csv.split('\r\n').length,22);
assert.ok(csv.includes('15590.339899'));assert.ok(csv.includes('"ingress",3,0,18,48,""'));
const malicious=structuredClone(s);malicious.title='=1+1';assert.ok(capacityCsv(malicious).includes('"\'=1+1"'));

console.log('PASS: both clusters, summaries and deductions, configured VM totals, separate units, precision, formula-safe text, no scenario mutation.');
