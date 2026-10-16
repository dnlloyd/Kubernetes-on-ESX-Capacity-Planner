import { capacityCsv, TYPES, AZS, clientCapacity, defaultDeductions, validateConfig, scenarioFilename, clusterCapacity, numaPlan, logicalCores, defaults, defaultCluster, reconcile, usage, distribute, normalizeState, assignHosts, hostName, hostUsage, pairedVM, affinitySummary } from './model.mjs';
const $ = id => document.getElementById(id);
const KEY = 'az-planner-scenario-v2';
let state = distribute(reconcile(defaults())), previous = null, drag = null, toastTimer;
let draftClusters = [];
const expandedHosts=new Set();
try {const saved=JSON.parse(localStorage.getItem('az-planner-expanded-hosts-v1')||'[]');if(Array.isArray(saved))saved.filter(k=>typeof k==='string').forEach(k=>expandedHosts.add(k));}catch{}
const fmt = n => Number(n.toFixed(2)).toLocaleString('en-US');
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storageAvailable = true;
try { const stored = localStorage.getItem(KEY); if (stored) state = normalizeState(JSON.parse(stored)); } catch { storageAvailable = false; }
function setConfigurationCollapsed(collapsed) {
  document.querySelector('.workspace').classList.toggle('configuration-collapsed',collapsed);
  $('configuration-panel').hidden=collapsed;
  const button=$('configuration-toggle');
  button.setAttribute('aria-expanded',String(!collapsed));
  const label=`${collapsed?'Expand':'Collapse'} Configuration panel`;
  button.setAttribute('aria-label',label);
  button.title=label;
  button.querySelector('.configuration-toggle-arrow').textContent=collapsed?'›':'‹';
}
try {setConfigurationCollapsed(localStorage.getItem('az-planner-configuration-collapsed')==='true');}catch{}
$('configuration-toggle').addEventListener('click',()=>{
  const collapsed=$('configuration-toggle').getAttribute('aria-expanded')==='true';
  setConfigurationCollapsed(collapsed);
  try {localStorage.setItem('az-planner-configuration-collapsed',String(collapsed));}catch{}
});
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageAvailable = true; } catch { storageAvailable = false; }
  $('save-status').textContent = storageAvailable ? 'Scenario saved in this browser' : 'Browser storage unavailable · export to keep this scenario';
}
function update(next, message, populate = false) { previous = structuredClone(state); state = next; save(); render(); if (populate) fillForm(); toast(message); }
function markPending() { $('config-status').textContent = 'You have unapplied changes.'; }
function fillForm() {
  const form = $('config-form');
  for (const key of ['memory', 'sockets', 'coresPerSocket', 'numaNodes']) form.elements[`host.${key}`].value = state.host[key];
  form.elements['host.hyperthreading'].value=state.host.hyperthreading?'active':'inactive';
  updateLogicalCores();
  AZS.forEach((_, i) => form.elements[`hosts.${i}`].value = state.hosts[i]);
  draftClusters = structuredClone(state.clusters);
  renderEditor();
  $('config-status').textContent = 'Changes apply when you press the button.';
  $('config-error').hidden = true;
}
function hostFromForm() {
  const form=$('config-form');
  const host={memory:Number(form.elements['host.memory'].value),sockets:Number(form.elements['host.sockets'].value),coresPerSocket:Number(form.elements['host.coresPerSocket'].value),numaNodes:Number(form.elements['host.numaNodes'].value),hyperthreading:form.elements['host.hyperthreading'].value==='active'};
  return {...host,cpu:logicalCores(host)};
}
function updateLogicalCores() {
  const host=hostFromForm(), threads=host.hyperthreading?2:1;
  const valid=Number.isInteger(host.sockets)&&host.sockets>0&&Number.isInteger(host.coresPerSocket)&&host.coresPerSocket>0&&host.cpu<=1000000;
  $('host-logical-cores').value=valid?fmt(host.cpu):'—';
  $('numa-topology-help').textContent=host.numaNodes>0?`${host.numaNodes} NUMA nodes per host · ${fmt(host.sockets*host.coresPerSocket/host.numaNodes)} physical cores and ${fmt(host.memory/host.numaNodes)} GB per node (even division assumed).`:'Enter the total NUMA node count per ESX host.';
  $('host-cpu-formula').textContent=valid?`${fmt(host.sockets)} sockets × ${fmt(host.coresPerSocket)} cores/socket × ${threads} threads/core = ${fmt(host.cpu)} logical cores`:'Enter positive whole-number sockets and cores/socket (maximum 1,000,000 logical cores).';
}
function captureEditor() {
  const form = $('config-form');
  for (const cluster of draftClusters) {
    cluster.label = form.elements[`${cluster.id}.label`].value;
    TYPES.forEach(type=>['count','cpu','memory'].forEach(key=>cluster.profiles[type][key]=Number(form.elements[`${cluster.id}.${type}.${key}`].value)));
  }
}
function renderEditor() {
  $('cluster-editors').innerHTML = draftClusters.map((cluster,index)=>`<fieldset class="cluster-editor"><legend>Cluster ${index+1}</legend><div class="editor-heading"><span class="editor-number">KUBERNETES CLUSTER ${String(index+1).padStart(2,'0')}</span><button type="button" class="text-button" data-remove="${esc(cluster.id)}" ${draftClusters.length===1?'disabled':''} aria-label="Remove cluster ${index+1}">Remove</button></div><label class="cluster-label-field">Cluster label<input name="${cluster.id}.label" type="text" value="${esc(cluster.label)}" maxlength="80" required aria-label="Cluster ${index+1} label"></label><div class="profile-head"><span>Node type</span><span>Count</span><span>Logical cores</span><span>GB</span></div>${TYPES.map(type=>`<div class="profile-row"><span class="type-label type-${type}"><span class="type-dot"></span>${type}</span>${['count','cpu','memory'].map(key=>`<input name="${cluster.id}.${type}.${key}" type="number" value="${cluster.profiles[type][key]}" min="${key==='count'?0:.01}" max="${key==='count'?3000:1000000}" step="${key==='count'?1:'any'}" required aria-label="Cluster ${index+1} ${type} ${key==='memory'?'memory GB':key==='cpu'?'logical cores':key}">`).join('')}</div>`).join('')}</fieldset>`).join('');
  $('draft-count').textContent = draftClusters.length;
  $('add-cluster').disabled = draftClusters.length>=2;
}
$('host-counts').innerHTML = AZS.map((az, i) => `<label><span>◦</span>${az}<input type="number" name="hosts.${i}" min="1" max="10000" step="1" required aria-label="${az} host count"></label>`).join('');
function resource(name, used, capacity) {
  const percent = capacity > 0 ? used / capacity * 100 : 0, exceeded = used > capacity;
  return `<div class="resource ${name==='Memory'?'memory':''} ${exceeded?'exceeded':''}"><div class="resource-label"><span>${name}</span><strong>${fmt(used)} <small>/ ${fmt(capacity)} ${name==='Memory'?'GB':'logical cores'}</small></strong></div><div class="track" role="meter" aria-label="${name} capacity allocated" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${Math.min(used,capacity)}" aria-valuetext="${fmt(percent)}% allocated"><div class="fill" style="width:${Math.min(percent,100)}%"></div></div><div class="resource-foot">${exceeded?`${fmt(used-capacity)} ${name==='Memory'?'GB':'logical cores'} over capacity`:`${fmt(percent)}% allocated · ${fmt(capacity-used)} ${name==='Memory'?'GB':'logical cores'} available`}</div></div>`;
}
function numaBadges(placement) {
  const badges=[];
  if(placement.remote>1e-8)badges.push(`<span class="numa-badge risk" title="Estimated ${fmt(placement.remote)} GB cannot fit on the proposed home node">▲ Memory spans nodes</span>`);
  if(placement.overflow>1e-8)badges.push('<span class="numa-badge risk">▲ Memory over capacity</span>');
  if(placement.contention)badges.push('<span class="numa-badge risk" title="Allocated vCPUs exceed physical cores on a proposed node; this is a contention risk, not measured CPU usage">▲ CPU contention risk</span>');
  if(placement.wide)badges.push('<span class="numa-badge wide">◆ Wide VM</span>');
  if(!badges.length)badges.push('<span class="numa-badge fit">● Fits locally</span>');
  return `<div class="vm-numa"><span>Suggested NUMA ${placement.nodes.join(' + ')} · memory home ${placement.home}</span>${badges.join('')}</div>`;
}
function vmCard(v, cluster, az, placement) {
  const p=cluster.profiles[v.type],mate=state.affinityEnabled?pairedVM(state,v):null;
  const hostControl=`<span class="worker-placement">${mate?`Paired with ${mate.name} · `:''}Automatic host placement</span>`;
  return `<div class="vm-card type-${v.type}" draggable="true" data-id="${esc(v.id)}" aria-label="${esc(cluster.label)} ${v.name}, ${p.cpu} logical cores, ${p.memory} GB, on ${v.host===null?'unplaced':hostName(az,v.host)}"><span class="grip" aria-hidden="true">⠿</span><div><span class="vm-name">${v.name}</span><span class="vm-cluster-label" title="${esc(cluster.label)}">${esc(cluster.label)}</span><span class="vm-spec">${fmt(p.cpu)} logical cores · ${fmt(p.memory)} GB</span>${placement?numaBadges(placement):'<span class="numa-badge risk">▲ Unplaced — affinity rules</span>'}<div class="vm-placement">${hostControl}</div></div><select class="move-select" data-id="${esc(v.id)}" aria-label="Move ${v.name} (${esc(cluster.label)}) to zone">${AZS.map((name,i)=>`<option value="${i}" ${az===i?'selected':''}>${name}</option>`).join('')}</select></div>`;
}
function hostCard(az,host){
  const plan=numaPlan(state,az,host);
  const u=hostUsage(state,az,host);
  const pair=state.affinityEnabled?u.vms.find(v=>v.type==='master'):null;
  const label=pair?state.clusters.find(c=>c.id===pair.clusterId).label:null;
  const status=plan.status==='risk'?'▲ NUMA risk':plan.status==='wide'?'◆ Wide VM':'● NUMA local fit';
  const ordered=[...u.vms].sort((a,b)=>TYPES.indexOf(a.type)-TYPES.indexOf(b.type)||a.name.localeCompare(b.name,undefined,{numeric:true})||a.clusterId.localeCompare(b.clusterId));
  const involved=v=>{const p=plan.placements.get(v.id);return plan.nodes.filter(n=>p.cpuByNode[n.id]>0||p.memoryByNode[n.id]>0).map(n=>n.id);};
  const card=v=>vmCard(v,state.clusters.find(c=>c.id===v.clusterId),az,plan.placements.get(v.id));
  const meter=(name,value,capacity,unit,node)=>{const percent=value/capacity*100;return `<div class="numa-resource"><div class="numa-resource-label"><strong>${name}</strong><span>${name==='CPU'?`${fmt(value)} vCPU / ${fmt(capacity)} logical CPUs`:`${fmt(value)} / ${fmt(capacity)} GB`}</span></div><div class="numa-track" role="meter" aria-label="NUMA ${node} ${name} allocated" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${Math.min(value,capacity)}" aria-valuetext="${fmt(value)} of ${fmt(capacity)} ${unit}, ${fmt(percent)}% allocated"><span style="width:${Math.min(100,percent)}%" class="${value>capacity?'over':''}"></span></div><span class="numa-percent">${fmt(percent)}% allocated</span></div>`;};
  const spanning=ordered.filter(v=>involved(v).length>1);
  const nodeCards=`<div class="numa-container-view"><div class="numa-estimate-heading">Suggested NUMA placement</div><div class="numa-placement-grid">${plan.nodes.map(n=>{const local=ordered.filter(v=>involved(v).length===1&&involved(v)[0]===n.id);return `<section class="numa-node-container" aria-label="NUMA ${n.id} placement"><div class="numa-node-head"><h4>NUMA ${n.id}</h4><p>${fmt(plan.capacity.physical)} physical cores · ${fmt(plan.capacity.logical)} logical CPUs</p>${meter('CPU',n.cpu,plan.capacity.logical,'vCPU',n.id)}${meter('Memory',n.memory,plan.capacity.memory,'GB',n.id)}</div><div class="numa-local-vms">${local.map(card).join('')||'<div class="empty-host">No VMs contained entirely in this node</div>'}</div></section>`;}).join('')}${spanning.map(v=>{const p=plan.placements.get(v.id),ids=involved(v);return `<section class="numa-spanning ${p.remote>0?'memory-spanning':'cpu-spanning'}" aria-label="${esc(v.name)} spans NUMA ${ids.join(' and ')}"><div class="numa-span-heading">${p.nodes.length>1?'CPU spans nodes':''}${p.nodes.length>1&&p.remote>0?' · ':''}${p.remote>0?'Memory spans nodes':''}</div>${card(v)}<div class="numa-span-allocations">${ids.map(id=>`<div><strong>NUMA ${id}</strong><span>CPU: ${fmt(p.cpuByNode[id])} vCPU</span><span>Memory: ${fmt(p.memoryByNode[id])} GB${p.overflow>0&&p.home===id?' (includes overflow)':''}</span></div>`).join('')}</div></section>`;}).join('')}</div><p class="numa-planning-note">Planning estimate, not live ESXi placement. Bars show configured allocation, not measured utilization. CPU bars use logical CPU capacity; physical-core contention warnings remain separate. Node totals include spanning VMs shown below.</p></div>`;
  return `<details class="esx-host ${u.over?'host-over':''} " data-host="${host}" data-az="${az}" ${expandedHosts.has(`${az}:${host}`)?'open':''} aria-label="${hostName(az,host)} ESX host"><summary class="host-summary"><div class="host-vm-summary"><span class="host-vm-total">${u.vms.length} VMs</span><div class="host-type-counts">${TYPES.map(type=>`<span>${type}: ${u.vms.filter(v=>v.type===type).length}</span>`).join('')}</div></div><div class="esx-host-heading"><span class="host-name">▤ ${hostName(az,host)}</span></div><div class="host-resources"><span class="${u.cpu>u.capacity.cpu?'host-exceeded':''}">Logical CPU: ${fmt(u.cpu)} / ${fmt(u.capacity.cpu)} cores</span><span class="${u.memory>u.capacity.memory?'host-exceeded':''}">Memory: ${fmt(u.memory)} / ${fmt(u.capacity.memory)} GB</span></div>${label?`<div class="dedication-label">Master/ingress pair · ${esc(label)}</div>`:''}<span class="numa-badge ${plan.status}">${status}</span></summary><div class="host-expanded">${nodeCards}</div></details>`;
}
function unplacedCard(az) {
  const a=affinitySummary(state,az);
  if(!a.unplaced.length)return '';
  return `<details class="unplaced-vms"><summary>▲ ${a.unplaced.length} unplaced VMs</summary><p>${a.minimumHosts>state.hosts[az]?`At least ${a.minimumHosts} hosts needed for these VM counts; ${state.hosts[az]} configured. `:''}${a.unpaired.length?`${a.unpaired.length} master/ingress VMs lack a matching partner. `:''}Change counts, add hosts, or move VMs to another AZ.</p>${a.unplaced.map(v=>vmCard(v,state.clusters.find(c=>c.id===v.clusterId),az,null)).join('')}</details>`;
}
function renderClusterCapacity() {
  const open=new Set([...document.querySelectorAll('.capacity-card details[open]')].map(el=>el.dataset.key));
  $('cluster-capacity-cards').innerHTML=state.clusters.map(cluster=>{
    const c=clusterCapacity(state,cluster.id),w=clientCapacity(state,cluster.id),d=cluster.deductions??defaultDeductions();
    const fields=[['nodeCpu','Node reserve / worker','vCPU'],['nodeMemoryGiB','Node reserve / worker','GiB'],['servicesCpu','Services / cluster','CPU'],['servicesMemoryGiB','Services / cluster','GiB']];
    return `<article class="capacity-card" aria-label="${esc(cluster.label)} capacity"><h3>${esc(cluster.label)}</h3><p class="capacity-small">Available for client workloads · baseline budget</p><div class="capacity-kpis client-budget"><div><strong>${fmt(w.cpu)}</strong><span>vCPUs for client workloads</span></div><div><strong>${fmt(w.memoryGiB)} GiB</strong><span>memory for client workloads</span></div></div><p class="capacity-small">${fmt(w.placed)} placed workers included${w.unplaced?` · ${fmt(w.unplaced)} unplaced workers excluded`:''}</p>${w.overdrawn||w.nodeOverdrawn?'<p class="budget-warning">Deductions exceed available worker resources. Review worker sizing and the baseline; negative budgets are shown as zero.</p>':''}<details class="deduction-details" data-key="${cluster.id}-deductions" ${open.has(`${cluster.id}-deductions`)?'open':''}><summary>Deduction details &amp; assumptions</summary><div class="deduction-body"><table><caption>Client workload budget calculation</caption><thead><tr><th scope="col">Step</th><th scope="col">CPU</th><th scope="col">GiB</th></tr></thead><tbody><tr><th scope="row">Placed workers, gross</th><td>${fmt(w.grossCpu)}</td><td>${fmt(w.grossMemoryGiB)}</td></tr><tr><th scope="row">− Node reservations</th><td>${fmt(w.nodeCpu)}</td><td>${fmt(w.nodeMemoryGiB)}</td></tr><tr><th scope="row">− Cluster services</th><td>${fmt(d.servicesCpu)}</td><td>${fmt(d.servicesMemoryGiB)}</td></tr></tbody><tfoot><tr><th scope="row">Client workload budget</th><td>${fmt(w.cpu)}</td><td>${fmt(w.memoryGiB)}</td></tr></tfoot></table><h4>Editable deductions</h4><p>Edit values, then Apply deductions to save them with this scenario. Values are independent per Kubernetes cluster.</p><div class="deduction-fields">${fields.map(([key,label,unit])=>`<label>${label} <span>${unit}</span><input type="number" min="0" max="1000000" step="any" value="${d[key]}" data-deduction="${key}" data-cluster="${esc(cluster.id)}" aria-label="${esc(cluster.label)} ${label} ${unit}" required></label>`).join('')}</div><button type="button" class="button secondary deduction-save" data-save-deductions="${esc(cluster.id)}">Apply deductions</button><h4>Where the baseline came from</h4><p><strong>Node CPU:</strong> the supplied worker describe showed 12 CPUs of Capacity and 11,500m (11.5 CPUs) Allocatable: 12 − 11.5 = <strong>0.5 vCPU per worker</strong>.</p><p><strong>Node memory:</strong> Capacity was 92,677,260 KiB and Allocatable was 85,861,471,162 bytes. (92,677,260 × 1,024 − 85,861,471,162) ÷ 1,073,741,824 = <strong>8.419196 GiB per worker</strong>. This includes the existing Capacity-to-Allocatable reservation; no extra OS allowance is subtracted.</p><p><strong>Cluster services:</strong> your worker-only namespace usage snapshot covered 1,577 of 1,577 matching pods and totaled <strong>56.295 CPU and 244.075 GiB</strong>. This is a fixed per-cluster baseline, not a per-worker deduction. The same snapshot is initially reused for both clusters; adjust each independently when more measurements are available.</p><p><strong>Formula:</strong> placed worker VM resources − (placed workers × node reserve) − cluster services. Master, ingress, etcd, and unplaced workers do not contribute to client capacity.</p><p><strong>Units:</strong> existing VM inputs are treated as decimal GB. We convert GB × 1,000,000,000 ÷ 1,073,741,824 to GiB before deducting measured memory. CPU uses vCPU units; 1,000m = 1 CPU.</p><p><strong>Meaning:</strong> a planning budget after baseline services, before existing client workload consumption. Usage is a snapshot, not requests, peak demand, or a live guarantee. The measured node reserve is assumed constant for other worker sizes. One ESX host per AZ is reserved in the ESX capacity totals for N+1 maintenance. Worker budgets use placed VM resources without an additional ESX host deduction. No additional growth or Kubernetes pod-request headroom is deducted.</p></div></details><details class="configured-capacity" data-key="${cluster.id}-configured" ${open.has(`${cluster.id}-configured`)?'open':''}><summary>Configured VM totals</summary><p class="capacity-small">${fmt(c.count)} VMs · ${fmt(c.unplaced)} unplaced · ${fmt(c.cpu)} vCPUs · ${fmt(c.memory)} GB</p><table><caption>All configured VM resources, including unplaced VMs</caption><thead><tr><th scope="col">Type</th><th scope="col">VMs</th><th scope="col">vCPUs</th><th scope="col">GB</th></tr></thead><tbody>${TYPES.map(t=>{const p=cluster.profiles[t];return `<tr><th scope="row">${t}</th><td>${fmt(p.count)}</td><td>${fmt(p.count*p.cpu)}</td><td>${fmt(p.count*p.memory)}</td></tr>`;}).join('')}</tbody><tfoot><tr><th scope="row">Total</th><td>${fmt(c.count)}</td><td>${fmt(c.cpu)}</td><td>${fmt(c.memory)}</td></tr></tfoot></table></details></article>`;
  }).join('');
}
$('cluster-capacity-cards').addEventListener('click',e=>{
  const button=e.target.closest('[data-save-deductions]');if(!button)return;
  const fields=[...button.closest('.capacity-card').querySelectorAll('[data-deduction]')];
  if(fields.some(input=>!input.reportValidity()))return;
  const next=structuredClone(state),cluster=next.clusters.find(c=>c.id===button.dataset.saveDeductions);
  cluster.deductions=Object.fromEntries(fields.map(input=>[input.dataset.deduction,Number(input.value)]));
  try {
    validateConfig(next);
    const draft=draftClusters.find(c=>c.id===cluster.id);if(draft)draft.deductions=structuredClone(cluster.deductions);
    update(next,'Capacity deductions saved.');
  }catch(error){toast(error.message);}
});
function render() {
  const scrolls=[...document.querySelectorAll('.vm-area')].map(el=>el.scrollTop);
  const stats = AZS.map((_, i) => usage(state, i));
  const cpuUsed = stats.reduce((n,s)=>n+s.cpu,0), cpuTotal=stats.reduce((n,s)=>n+s.capacity.cpu,0);
  const memUsed = stats.reduce((n,s)=>n+s.memory,0), memTotal=stats.reduce((n,s)=>n+s.capacity.memory,0);
  $('scenario-title').value=state.title;
  $('affinity-toggle').checked=state.affinityEnabled;
  $('affinity-toggle-state').textContent=state.affinityEnabled?'On':'Off';
  $('affinity-policy').classList.toggle('rules-off',!state.affinityEnabled);
  $('region-clusters').textContent = `${state.clusters.length} Kubernetes cluster${state.clusters.length===1?'':'s'}`;
  $('summary').innerHTML = `<div class="stat"><span class="stat-title">TOTAL VIRTUAL MACHINES</span><span class="stat-icon">◇</span><div class="stat-number">${fmt(state.vms.length)}<small>VMs</small></div><div class="stat-sub">In <strong>${state.clusters.length} Kubernetes clusters</strong> · 3 AZs</div></div><div class="stat"><span class="stat-title">LOGICAL CPU CAPACITY · N+1</span><span class="stat-icon">▤</span><div class="stat-number">${fmt(cpuTotal)}<small>logical cores</small></div><div class="stat-sub"><strong>${fmt(cpuUsed)} requested</strong> · ${fmt(cpuTotal>0?cpuUsed/cpuTotal*100:0)}% requested</div></div><div class="stat"><span class="stat-title">MEMORY CAPACITY · N+1</span><span class="stat-icon">▥</span><div class="stat-number">${fmt(memTotal)}<small>GB</small></div><div class="stat-sub"><strong>${fmt(memUsed)} requested</strong> · ${fmt(memTotal>0?memUsed/memTotal*100:0)}% requested</div></div>`;
  const counts = stats.map(s=>s.vms.length);
  const totalBalanced = Math.max(...counts)-Math.min(...counts)<=1;
  const typesBalanced = state.clusters.every(cluster=>TYPES.every(type => { const c = stats.map(s=>s.vms.filter(v=>v.clusterId===cluster.id && v.type===type).length); return Math.max(...c)-Math.min(...c)<=1; }));
  $('spread-label').textContent = totalBalanced && typesBalanced ? '◉ Even spread across zones' : totalBalanced ? '◉ Even totals · cluster/type spread varies' : '◌ Custom placement';
  $('clusters').innerHTML = stats.map((s, az) => `<article class="cluster ${s.over?'over':''}" data-az="${az}" aria-label="${AZS[az]} cluster"><div class="cluster-top"><div class="cluster-title-row"><span class="az-icon">▦</span><h3>${AZS[az]}</h3><span class="health ${s.over||s.vms.some(v=>v.host===null)?'warning':''}">${s.over?'Over capacity':s.vms.some(v=>v.host===null)?'Placement shortage':'Within capacity'}</span></div><div class="host-caption">${fmt(state.hosts[az])} ESX host${state.hosts[az]===1?'':'s'} · ${fmt(state.host.cpu)} logical cores / ${fmt(state.host.memory)} GB each<span class="host-topology">${state.host.sockets} sockets × ${state.host.coresPerSocket} physical cores/socket · Hyperthreading ${state.host.hyperthreading?'active':'inactive'} · ${state.host.numaNodes} NUMA nodes</span></div><div class="nplus-one-note">N+1 capacity · ${Math.max(0,state.hosts[az]-1)} hosts usable · 1 host reserved</div>${resource('Logical CPU',s.cpu,s.capacity.cpu)}${resource('Memory',s.memory,s.capacity.memory)}</div><div class="vm-area"><div class="vm-list-heading"><span>ESX HOSTS & VMs</span><span>${s.vms.filter(v=>v.host!==null).length} placed · ${s.vms.filter(v=>v.host===null).length} unplaced</span></div>${unplacedCard(az)}${Array.from({length:state.hosts[az]},(_,host)=>hostCard(az,host)).join('')}</div><div class="cluster-bottom">${state.affinityEnabled?'Affinity rules on · both Kubernetes clusters':'Affinity rules off · unrestricted distribution'}</div></article>`).join('');
  document.querySelectorAll('.vm-area').forEach((el,i)=>el.scrollTop=scrolls[i]??0);
  renderClusterCapacity();
  $('undo').disabled = !previous;
  const over = stats.map((s,i)=>s.over?AZS[i]:null).filter(Boolean);
  const hostOver=AZS.flatMap((_,az)=>Array.from({length:state.hosts[az]},(_,host)=>hostUsage(state,az,host).over?hostName(az,host):null)).filter(Boolean);
  const affinity=AZS.map((_,az)=>affinitySummary(state,az));
  $('affinity-warning').hidden=!affinity.some(a=>a.unplaced.length);
  $('affinity-warning').textContent=affinity.flatMap((a,az)=>a.unplaced.length?[`${AZS[az]}: ${a.unplaced.length} unplaced; ${state.hosts[az]} hosts configured, at least ${a.minimumHosts} needed for current counts${a.unpaired.length?`; ${a.unpaired.length} unmatched master/ingress VMs`:''}.`]:[]).join(' ')+' Limits apply across both Kubernetes clusters. Host counts are a placement minimum, before resource and failover headroom.';
  $('capacity-warning').hidden = !over.length && !hostOver.length;
  $('capacity-warning').textContent = `${over.length?`⚠ ${over.join(', ')} exceed N+1 capacity. `:''}${hostOver.length?`${hostOver.length} ESX host${hostOver.length===1?'':'s'} exceed individual capacity. `:''}Add hosts, move VMs between AZs, or adjust node sizes. Over-capacity placements are allowed.`;
}
function move(id,az) {
  const vm=state.vms.find(v=>v.id===id);if(!vm||![0,1,2].includes(az))return;
  if(vm.az===az){toast('Hosts are assigned automatically. Move to another AZ to change zone placement.');return;}
  const next=structuredClone(state),target=next.vms.find(v=>v.id===id),mate=state.affinityEnabled?pairedVM(next,target):null;
  target.az=az;if(mate)mate.az=az;
  update(assignHosts(next),`${vm.name}${mate?` and ${mate.name}`:''} moved to ${AZS[az]}. Automatic host placement recalculated.`);
}
$('scenario-title').addEventListener('input',e=>{state={...state,title:e.target.value.trim()||'Untitled scenario'};save();});
$('scenario-title').addEventListener('blur',()=>{$('scenario-title').value=state.title;});
$('affinity-toggle').addEventListener('change',e=>{
  const enabled=e.target.checked;
  update(assignHosts({...state,affinityEnabled:enabled}),enabled?'Placement rules enabled. Pairs and per-host limits reapplied.':'Placement rules disabled. VMs redistributed without affinity restrictions.');
});
$('config-form').addEventListener('input',()=>{updateLogicalCores();markPending();});
$('config-form').addEventListener('change',e=>{if(e.target.name==='host.hyperthreading'){updateLogicalCores();markPending();}});
$('add-cluster').addEventListener('click',()=>{
  if(draftClusters.length>=2) return;
  captureEditor();
  const id=`k8s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  let n=1; while(draftClusters.some(c=>c.label===`Kubernetes cluster ${n}`)) n++;
  draftClusters.push(defaultCluster(id,`Kubernetes cluster ${n}`)); renderEditor(); markPending();
});
$('cluster-editors').addEventListener('click',e=>{
  const button=e.target.closest('[data-remove]');
  if(!button || draftClusters.length<=1) return;
  captureEditor(); draftClusters=draftClusters.filter(c=>c.id!==button.dataset.remove); renderEditor(); markPending();
});
$('config-form').addEventListener('submit', event => {
  event.preventDefault(); captureEditor(); const data = new FormData(event.currentTarget);
  const config = {schemaVersion:6,title:state.title,affinityEnabled:state.affinityEnabled,regionType:state.regionType,host:hostFromForm(),hosts:AZS.map((_,i)=>Number(data.get(`hosts.${i}`))),clusters:structuredClone(draftClusters)};
  config.clusters.forEach(c=>c.label=c.label.trim());
  try { update(reconcile(config,state.vms,{balanceWorkers:true}),'Configuration applied. Automatic host placement recalculated.',true); } catch(e) { $('config-error').textContent=e.message; $('config-error').hidden=false; }
});
$('balance').addEventListener('click',()=>{try{update(distribute(state),'VMs distributed across AZs using the selected placement mode.');}catch(e){toast(e.message);}});
$('balance-workers').addEventListener('click',()=>{try{update(assignHosts(state,{balanceWorkers:true}),'Hosts rebalanced using the selected placement mode.');}catch(e){toast(e.message);}});
$('undo').addEventListener('click',()=>{ if (!previous) return; state=previous; previous=null; save(); render(); fillForm(); toast('Last change undone.'); });
$('clusters').addEventListener('toggle',e=>{
  if(!e.target.matches('details.esx-host')||!e.target.isConnected)return;
  const key=`${e.target.dataset.az}:${e.target.dataset.host}`;
  if(e.target.open)expandedHosts.add(key);else expandedHosts.delete(key);
  try{localStorage.setItem('az-planner-expanded-hosts-v1',JSON.stringify([...expandedHosts]));}catch{}
},true);
$('clusters').addEventListener('change',e=>{
  if(e.target.matches('.move-select'))move(e.target.dataset.id,Number(e.target.value));

});
// Pointer-based dragging supports mouse, pen and touch, including empty cluster headers.
$('clusters').addEventListener('dragstart',e=>e.preventDefault());
$('clusters').addEventListener('pointerdown',e=>{
  if(e.button!==0 || e.target.closest('select, label')) return;
  const card=e.target.closest('.vm-card'); if(!card || card.getAttribute('draggable')==='false') return;
  e.preventDefault(); card.setPointerCapture(e.pointerId);
  drag={id:card.dataset.id,card,pointer:e.pointerId,x:e.clientX,y:e.clientY,ghost:null};
});
window.addEventListener('pointermove',e=>{
  if(!drag || drag.pointer!==e.pointerId) return;
  if(!drag.ghost && Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5) return;
  if(!drag.ghost){
    drag.ghost=drag.card.cloneNode(true); drag.ghost.classList.add('drag-ghost');
    drag.ghost.style.width=`${drag.card.getBoundingClientRect().width}px`;
    drag.ghost.setAttribute('aria-hidden','true'); drag.ghost.querySelectorAll('select').forEach(el=>el.remove());
    document.body.append(drag.ghost); drag.card.classList.add('dragging');
  }
  drag.ghost.style.left=`${e.clientX+12}px`; drag.ghost.style.top=`${e.clientY+12}px`;
  document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
  const beneath=document.elementFromPoint(e.clientX,e.clientY);
  (beneath?.closest('.esx-host') || beneath?.closest('.cluster'))?.classList.add('drag-over');
});
function finishDrag(e,cancelled=false){
  if(!drag || drag.pointer!==e.pointerId) return;
  const current=drag; drag=null;
  const beneath=document.elementFromPoint(e.clientX,e.clientY);
  const target=beneath?.closest('.esx-host') || beneath?.closest('.cluster');
  current.ghost?.remove(); current.card.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
  if(current.card.hasPointerCapture(e.pointerId)) current.card.releasePointerCapture(e.pointerId);
  if(current.ghost && target && !cancelled) move(current.id,Number(target.dataset.az),target.matches('.esx-host')?Number(target.dataset.host):null);
}
window.addEventListener('pointerup',e=>finishDrag(e));
window.addEventListener('pointercancel',e=>finishDrag(e,true));
$('export-capacity').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([capacityCsv(state)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;
  link.download=scenarioFilename(state.title).replace(/\.json$/,'-capacity.csv');
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Kubernetes cluster capacity exported.');
});
$('export-button').addEventListener('click',()=>{ const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})); const a=document.createElement('a'); a.href=url; a.download=scenarioFilename(state.title); a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast('Region scenario exported.'); });
$('import-button').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{ const file=e.target.files[0]; if(!file) return; try { if(file.size>2000000) throw Error('Scenario file must be smaller than 2 MB.'); const imported=normalizeState(JSON.parse(await file.text())); update(imported,'Region scenario imported.',true); } catch(e) { toast(`Import failed: ${e.message}`); } e.target.value=''; });
$('reset').addEventListener('click',()=>update(distribute(reconcile(defaults())),'Two default Kubernetes clusters restored. Use Undo to recover your scenario.',true));
fillForm(); render(); save();
