import { isMaintenanceHost, numaMemoryPerNode, capacityCsv, TYPES, AZS, clientCapacity, defaultDeductions, validateConfig, scenarioFilename, clusterCapacity, numaPlan, logicalCores, defaults, defaultCluster, reconcile, usage, distribute, normalizeState, assignHosts, hostName, hostUsage, affinitySummary } from './model.mjs';
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
  $('numa-topology-help').textContent=host.numaNodes>0?`${host.numaNodes} NUMA nodes per host · ${fmt(host.sockets*host.coresPerSocket/host.numaNodes)} physical cores and ${fmt(numaMemoryPerNode(host))} GB usable per node after 10% ESX memory reserve (even division assumed).`:'Enter the total NUMA node count per ESX host.';
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
  if(placement.splitEtcd)badges.push('<span class="numa-badge fit">● Etcd 2+2 policy</span>');
  if(placement.remote>1e-8)badges.push(`<span class="numa-badge risk" title="Estimated ${fmt(placement.remote)} GB cannot fit on the proposed home node">▲ Memory spans nodes</span>`);
  if(placement.overflow>1e-8)badges.push('<span class="numa-badge risk">▲ Memory over capacity</span>');
  if(placement.contention)badges.push('<span class="numa-badge risk" title="Allocated vCPUs exceed physical cores on a proposed node; this is a contention risk, not measured CPU usage">▲ CPU contention risk</span>');
  if(placement.wide)badges.push('<span class="numa-badge wide">◆ Wide VM</span>');
  if(!badges.length)badges.push('<span class="numa-badge fit">● Fits locally</span>');
  return `<div class="vm-numa"><span>${placement.splitEtcd?'Etcd: 2 vCPUs and half its memory per NUMA node':`Suggested NUMA ${placement.nodes.join(' + ')} · memory home ${placement.home}`}</span>${badges.join('')}</div>`;
}
function vmCard(v, cluster, az, placement) {
  const p=cluster.profiles[v.type];
  const hostControl=`<span class="worker-placement">Automatic host placement</span>`;
  return `<div class="vm-card type-${v.type}" draggable="true" data-id="${esc(v.id)}" aria-label="${esc(cluster.label)} ${v.name}, ${p.cpu} logical cores, ${p.memory} GB, on ${v.host===null?'unplaced':hostName(az,v.host)}"><span class="grip" aria-hidden="true">⠿</span><div><span class="vm-name">${v.name}</span><span class="vm-cluster-label" title="${esc(cluster.label)}">${esc(cluster.label)}</span><span class="vm-spec">${fmt(p.cpu)} logical cores · ${fmt(p.memory)} GB</span>${placement?numaBadges(placement):'<span class="numa-badge risk">▲ Unplaced</span>'}<div class="vm-placement">${hostControl}</div></div><select class="move-select" data-id="${esc(v.id)}" aria-label="Move ${v.name} (${esc(cluster.label)}) to zone">${AZS.map((name,i)=>`<option value="${i}" ${az===i?'selected':''}>${name}</option>`).join('')}</select></div>`;
}
function hostCard(az,host){
  if(isMaintenanceHost(state,az,host))return `<details class="esx-host maintenance-host" data-host="${host}" data-az="${az}" ${expandedHosts.has(`${az}:${host}`)?'open':''} aria-label="${hostName(az,host)} ESX host, reserved for maintenance"><summary class="host-summary"><div class="host-vm-summary"><span class="host-vm-total">0 VMs</span></div><div class="esx-host-heading"><span class="host-name">▤ ${hostName(az,host)}</span></div><div class="host-resources"><span>Logical CPU: 0 / ${fmt(state.host.cpu)} cores</span><span>Memory: 0 / ${fmt(state.host.memory)} GB</span></div><span class="maintenance-label">Reserved for maintenance</span></summary><div class="host-expanded"><p class="maintenance-description">N+1 reserve: no VMs are scheduled on this host, with placement rules on or off. Its CPU and memory are already excluded from AZ and region capacity totals.</p></div></details>`;

  const plan=numaPlan(state,az,host);
  const u=hostUsage(state,az,host);
  const status=plan.status==='risk'?'▲ NUMA risk':plan.status==='wide'?'◆ Wide VM':'● NUMA local fit';
  const ordered=[...u.vms].sort((a,b)=>TYPES.indexOf(a.type)-TYPES.indexOf(b.type)||a.name.localeCompare(b.name,undefined,{numeric:true})||a.clusterId.localeCompare(b.clusterId));
  const involved=v=>{const p=plan.placements.get(v.id);return plan.nodes.filter(n=>p.cpuByNode[n.id]>0||p.memoryByNode[n.id]>0).map(n=>n.id);};
  const card=v=>vmCard(v,state.clusters.find(c=>c.id===v.clusterId),az,plan.placements.get(v.id));
  const meter=(name,value,capacity,unit,node)=>{const percent=value/capacity*100;return `<div class="numa-resource"><div class="numa-resource-label"><strong>${name}</strong><span>${name==='CPU'?`${fmt(value)} vCPUs / ${fmt(capacity)} physical cores`:`${fmt(value)} / ${fmt(capacity)} GB`}</span></div><div class="numa-track" role="meter" aria-label="NUMA ${node} ${name} allocated" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${Math.min(value,capacity)}" aria-valuetext="${name==='CPU'?`${fmt(value)} vCPUs allocated across ${fmt(capacity)} physical cores`:`${fmt(value)} of ${fmt(capacity)} ${unit}`}, ${fmt(percent)}% allocated"><span style="width:${Math.min(100,percent)}%" class="${value>capacity?'over':''}"></span></div><span class="numa-percent">${fmt(percent)}% allocated</span></div>`;};
  const spanning=ordered.filter(v=>involved(v).length>1);
  const nodeCards=`<div class="numa-container-view"><div class="numa-estimate-heading">Suggested NUMA placement</div><div class="numa-placement-grid">${plan.nodes.map(n=>{const local=ordered.filter(v=>involved(v).length===1&&involved(v)[0]===n.id);return `<section class="numa-node-container" aria-label="NUMA ${n.id} placement"><div class="numa-node-head"><h4>NUMA ${n.id}</h4><p>${fmt(plan.capacity.physical)} physical cores</p>${state.affinityEnabled?`<p class="numa-policy-budget">Etcd slot: 2 cores · ${fmt(plan.memoryReserve)} GB<br>Other VMs: ≤${fmt(plan.cpuBudget)} vCPUs per node</p>`:''}${meter('CPU',n.cpu,plan.capacity.physical,'physical cores',n.id)}${meter('Memory',n.memory,plan.capacity.memory,'GB',n.id)}</div><div class="numa-local-vms">${local.map(card).join('')||'<div class="empty-host">No VMs contained entirely in this node</div>'}</div></section>`;}).join('')}${spanning.map(v=>{const p=plan.placements.get(v.id),ids=involved(v);return `<section class="numa-spanning ${p.remote>0?'memory-spanning':'cpu-spanning'}" aria-label="${esc(v.name)} spans NUMA ${ids.join(' and ')}"><div class="numa-span-heading">${p.splitEtcd?'Etcd 2+2 · CPU and memory split':p.nodes.length>1?'CPU spans nodes':''}${p.nodes.length>1&&p.remote>0?' · ':''}${p.remote>0?'Memory spans nodes':''}</div>${card(v)}<div class="numa-span-allocations">${ids.map(id=>`<div><strong>NUMA ${id}</strong><span>CPU: ${fmt(p.cpuByNode[id])} vCPU</span><span>Memory: ${fmt(p.memoryByNode[id])} GB${p.overflow>0&&p.home===id?' (includes overflow)':''}</span></div>`).join('')}</div></section>`;}).join('')}</div><p class="numa-planning-note">Planning estimate: memory capacity = host RAM × 90% ÷ NUMA nodes (10% ESX reserve). Not live ESXi placement. Bars show configured allocation, not measured utilization. CPU allocation compares vCPUs with physical cores; above 100% indicates physical-core oversubscription. Node totals include spanning VMs shown below. With rules enabled, the etcd slot is reserved on every host; a placed etcd VM consumes that slot rather than adding another reserve.</p></div>`;
  return `<details class="esx-host ${u.over?'host-over':''} " data-host="${host}" data-az="${az}" ${expandedHosts.has(`${az}:${host}`)?'open':''} aria-label="${hostName(az,host)} ESX host"><summary class="host-summary"><div class="host-vm-summary"><span class="host-vm-total">${u.vms.length} VMs</span><div class="host-type-counts">${TYPES.map(type=>`<span>${type}: ${u.vms.filter(v=>v.type===type).length}</span>`).join('')}</div></div><div class="esx-host-heading"><span class="host-name">▤ ${hostName(az,host)}</span></div><div class="host-resources"><span class="${u.cpu>u.capacity.cpu?'host-exceeded':''}">Logical CPU: ${fmt(u.cpu)} / ${fmt(u.capacity.cpu)} cores</span><span class="${u.memory>u.capacity.memory?'host-exceeded':''}">Memory: ${fmt(u.memory)} / ${fmt(u.capacity.memory)} GB</span></div><span class="numa-badge ${plan.status}">${status}</span></summary><div class="host-expanded">${nodeCards}</div></details>`;
}
function unplacedCard(az) {
  const a=affinitySummary(state,az);
  if(!a.unplaced.length)return '';
  return `<details class="unplaced-vms"><summary>▲ ${a.unplaced.length} unplaced VMs</summary><p>${a.issues.map(esc).join(' ')} One host is reserved for maintenance. ${state.affinityEnabled?'VMs could not fit the remaining hosts’ per-node CPU/memory budgets or role-separation rules.':'There are no schedulable hosts in this AZ.'} Add hosts, change sizes, or move individual VMs to another AZ. Placement uses a load-balancing heuristic, not a guaranteed optimal packing.</p>${a.unplaced.map(v=>vmCard(v,state.clusters.find(c=>c.id===v.clusterId),az,null)).join('')}</details>`;
}
function renderClusterCapacity() {
  const open=new Set([...document.querySelectorAll('.capacity-card details[open]')].map(el=>el.dataset.key));
  $('cluster-capacity-cards').innerHTML=state.clusters.map(cluster=>{
    const c=clusterCapacity(state,cluster.id),w=clientCapacity(state,cluster.id),d=cluster.deductions??defaultDeductions();
    const fields=[['nodeCpu','Node reserve / worker','vCPU'],['nodeMemoryGiB','Node reserve / worker','GiB'],['servicesCpu','Platform overhead / cluster','vCPU'],['servicesMemoryGiB','Platform overhead / cluster','GiB']];
    return `<article class="capacity-card" aria-label="${esc(cluster.label)} capacity"><h3>${esc(cluster.label)}</h3><p class="capacity-small">Available for client workloads · baseline budget</p><div class="capacity-kpis client-budget"><div><strong>${fmt(w.cpu)}</strong><span>vCPUs for client workloads</span></div><div><strong>${fmt(w.memoryGiB)} GiB</strong><span>memory for client workloads</span></div></div><p class="capacity-small">${fmt(w.placed)} placed workers included${w.unplaced?` · ${fmt(w.unplaced)} unplaced workers excluded`:''}</p>${w.overdrawn||w.nodeOverdrawn?'<p class="budget-warning">Deductions exceed available worker resources. Review worker sizing and the baseline; negative budgets are shown as zero.</p>':''}<details class="deduction-details" data-key="${cluster.id}-deductions" ${open.has(`${cluster.id}-deductions`)?'open':''}><summary>Deduction details &amp; assumptions</summary><div class="deduction-body"><table><caption>Client workload budget calculation</caption><thead><tr><th scope="col">Step</th><th scope="col">CPU</th><th scope="col">GiB</th></tr></thead><tbody><tr><th scope="row">Placed workers, gross</th><td>${fmt(w.grossCpu)}</td><td>${fmt(w.grossMemoryGiB)}</td></tr><tr><th scope="row">− Node reservations</th><td>${fmt(w.nodeCpu)}</td><td>${fmt(w.nodeMemoryGiB)}</td></tr><tr><th scope="row">− Platform overhead</th><td>${fmt(d.servicesCpu)}</td><td>${fmt(d.servicesMemoryGiB)}</td></tr></tbody><tfoot><tr><th scope="row">Client workload budget</th><td>${fmt(w.cpu)}</td><td>${fmt(w.memoryGiB)}</td></tr></tfoot></table><h4>Editable deductions</h4><p>Edit values, then Apply deductions to save them with this scenario. Values are independent per Kubernetes cluster.</p><div class="deduction-fields">${fields.map(([key,label,unit])=>`<label>${label} <span>${unit}</span><input type="number" min="0" max="1000000" step="any" value="${d[key]}" data-deduction="${key}" data-cluster="${esc(cluster.id)}" aria-label="${esc(cluster.label)} ${label} ${unit}" required></label>`).join('')}</div><button type="button" class="button secondary deduction-save" data-save-deductions="${esc(cluster.id)}">Apply deductions</button><h4>How capacity deductions work</h4><p><strong>Node CPU reserve:</strong> CPU set aside on each placed worker for the operating system, container runtime, kubelet, and other node processes. The default is <strong>0.5 vCPU per worker</strong>; the total deduction grows with the number of placed workers.</p><p><strong>Node memory reserve:</strong> memory set aside on each placed worker for those node processes. The default is <strong>8.5 GiB per worker</strong>. This is an editable allowance, not automatically calculated from the VM's size. Adjust it to match your environment.</p><p><strong>Platform overhead:</strong> worker resources budgeted for shared Kubernetes and platform workloads, such as cluster DNS, networking agents, monitoring, logging, and security tooling. Defaults are <strong>60 vCPUs and 250 GiB per cluster</strong>, deducted once per cluster rather than once per worker. Include only resources running on workers, and avoid counting resources already covered by the node reserves.</p><p><strong>Formula:</strong> placed worker VM resources − (placed workers × node reserve) − platform overhead. Master, ingress, etcd, and unplaced workers do not contribute to client workload capacity.</p><p><strong>Units:</strong> VM memory inputs use decimal GB and are converted to GiB before memory deductions. CPU uses vCPU units; 1,000m = 1 vCPU.</p><p><strong>Using the budget:</strong> the result estimates capacity available for client workloads before subtracting existing client consumption. Set reserves and overhead independently for each Kubernetes cluster based on its operating requirements. The values remain fixed until edited; the tool does not measure usage or automatically scale platform overhead with worker count. Budgets below zero are displayed as zero. Maintenance capacity is already reserved at the ESX placement and capacity layers, so no additional ESX host deduction is applied here.</p></div></details><details class="configured-capacity" data-key="${cluster.id}-configured" ${open.has(`${cluster.id}-configured`)?'open':''}><summary>Configured VM totals</summary><p class="capacity-small">${fmt(c.count)} VMs · ${fmt(c.unplaced)} unplaced · ${fmt(c.cpu)} vCPUs · ${fmt(c.memory)} GB</p><table><caption>All configured VM resources, including unplaced VMs</caption><thead><tr><th scope="col">Type</th><th scope="col">VMs</th><th scope="col">vCPUs</th><th scope="col">GB</th></tr></thead><tbody>${TYPES.map(t=>{const p=cluster.profiles[t];return `<tr><th scope="row">${t}</th><td>${fmt(p.count)}</td><td>${fmt(p.count*p.cpu)}</td><td>${fmt(p.count*p.memory)}</td></tr>`;}).join('')}</tbody><tfoot><tr><th scope="row">Total</th><td>${fmt(c.count)}</td><td>${fmt(c.cpu)}</td><td>${fmt(c.memory)}</td></tr></tfoot></table></details></article>`;
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
  checkMobilityFreshness();
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
  $('affinity-warning').hidden=!affinity.some(a=>a.unplaced.length||a.issues.length);
  $('affinity-warning').textContent=affinity.flatMap((a,az)=>a.unplaced.length||a.issues.length?[`${AZS[az]}: ${a.unplaced.length} unplaced. ${a.issues.join(' ')}`]:[]).join(' ')+' One host per AZ is reserved for maintenance. '+(state.affinityEnabled?'Enabled rules enforce NUMA budgets and role separation. ':'')+'Unplaced demand is excluded from client workload budgets.';
  $('capacity-warning').hidden = !over.length && !hostOver.length;
  $('capacity-warning').textContent = `${over.length?`⚠ ${over.join(', ')} exceed N+1 capacity. `:''}${hostOver.length?`${hostOver.length} ESX host${hostOver.length===1?'':'s'} exceed individual capacity. `:''}Add hosts, move VMs between AZs, or adjust node sizes. Over-capacity placements are allowed.`;
}
function move(id,az) {
  const vm=state.vms.find(v=>v.id===id);if(!vm||![0,1,2].includes(az))return;
  if(vm.az===az){toast('Hosts are assigned automatically. Move to another AZ to change zone placement.');return;}
  const next=structuredClone(state),target=next.vms.find(v=>v.id===id);
  target.az=az;
  update(assignHosts(next),`${vm.name} moved to ${AZS[az]}. Automatic host placement recalculated.`);
}
$('scenario-title').addEventListener('input',e=>{state={...state,title:e.target.value.trim()||'Untitled scenario'};save();});
$('scenario-title').addEventListener('blur',()=>{$('scenario-title').value=state.title;});
$('affinity-toggle').addEventListener('change',e=>{
  const enabled=e.target.checked;
  update(assignHosts({...state,affinityEnabled:enabled}),enabled?'Placement rules enabled. Etcd reserves, NUMA fit, and role separation applied.':'Placement rules disabled. VMs redistributed without affinity restrictions.');
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
  const drop=beneath?.closest('.esx-host') || beneath?.closest('.cluster');
  if(!drop?.classList.contains('maintenance-host'))drop?.classList.add('drag-over');
});
function finishDrag(e,cancelled=false){
  if(!drag || drag.pointer!==e.pointerId) return;
  const current=drag; drag=null;
  const beneath=document.elementFromPoint(e.clientX,e.clientY);
  const target=beneath?.closest('.esx-host') || beneath?.closest('.cluster');
  current.ghost?.remove(); current.card.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
  if(current.card.hasPointerCapture(e.pointerId)) current.card.releasePointerCapture(e.pointerId);
  if(current.ghost && target?.classList.contains('maintenance-host') && !cancelled){toast('This host is in maintenance mode and cannot receive VMs.');return;}
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
$('reset').addEventListener('click',()=>{
  stopMobility();mobilityRows=null;mobilitySnapshot=null;mobilityKey=null;
  $('mobility-results').hidden=true;$('mobility-rows').innerHTML='';$('mobility-summary').textContent='';
  $('mobility-status').textContent='Not assessed';$('mobility-az').value='all';$('mobility-filter').value='all';
  update(distribute(reconcile(defaults())),'Default scenario restored. Use Undo to recover your scenario.',true);
});
// Assessment is transient and read-only. Web Worker termination also handles cancellation.
let mobilityWorker=null,mobilityRows=null,mobilitySnapshot=null,mobilityKey=null;
function mobilityFingerprint(s){return JSON.stringify({host:s.host,hosts:s.hosts,affinityEnabled:s.affinityEnabled,clusters:s.clusters.map(c=>({id:c.id,label:c.label,profiles:c.profiles})),vms:s.vms});}
function stopMobility(){if(mobilityWorker)mobilityWorker.terminate();mobilityWorker=null;$('mobility-cancel').hidden=true;$('mobility-progress').hidden=true;$('mobility-run').disabled=false;}
function checkMobilityFreshness(){
  if(mobilityKey&&mobilityKey!==mobilityFingerprint(state)){
    stopMobility();$('mobility-status').textContent='Assessment out of date — run again for the current scenario.';
    $('mobility-results').classList.add('mobility-stale');
  }
}
function renderMobilityRows(){
  if(!mobilityRows)return;
  const filtered=mobilityRows.filter(r=>($('mobility-az').value==='all'||r.az===Number($('mobility-az').value))&&($('mobility-filter').value==='all'||r.status===$('mobility-filter').value));
  const symbols={movable:'● Movable',limited:'▲ Limited',blocked:'■ Blocked',unplaced:'Unplaced — not assessed'};
  $('mobility-rows').innerHTML=filtered.map(r=>`<tr><th scope="row">${esc(r.name)}<small>${esc(r.cluster)}</small></th><td>${AZS[r.az]}<small>${r.source===null?'Unplaced':hostName(r.az,r.source)}</small></td><td><span class="mobility-badge ${r.status}">${symbols[r.status]}</span>${r.status==='unplaced'?'':`<details class="mobility-vm-detail" data-id="${esc(r.id)}"><summary>${r.eligibleHosts.length} eligible destination${r.eligibleHosts.length===1?'':'s'} — details for ${esc(r.name)}</summary><div></div></details>`}</td></tr>`).join('')||'<tr><td colspan="3">No VMs match these filters.</td></tr>';
}
$('mobility-rows').addEventListener('toggle',e=>{
  const detail=e.target;if(!detail.matches('.mobility-vm-detail')||!detail.open||detail.dataset.loaded)return;
  const r=mobilityRows.find(r=>r.id===detail.dataset.id);if(!r)return;
  const groups=new Map();for(const rejected of r.rejected){if(!groups.has(rejected.reason))groups.set(rejected.reason,[]);groups.get(rejected.reason).push(hostName(r.az,rejected.host));}
  detail.querySelector('div').innerHTML=`<p><strong>Eligible:</strong> ${r.eligibleHosts.map(h=>hostName(r.az,h)).join(', ')||'None'}</p>${[...groups].map(([reason,hosts])=>`<p><strong>${esc(reason)}:</strong> ${hosts.join(', ')}</p>`).join('')}`;
  detail.dataset.loaded='true';
},true);
$('mobility-az').addEventListener('change',renderMobilityRows);$('mobility-filter').addEventListener('change',renderMobilityRows);
$('mobility-cancel').addEventListener('click',()=>{stopMobility();$('mobility-status').textContent='Assessment cancelled. Previous results, if shown, are retained.';});
$('mobility-run').addEventListener('click',()=>{
  stopMobility();mobilitySnapshot=structuredClone(state);mobilityKey=mobilityFingerprint(state);
  $('mobility-results').hidden=true;$('mobility-results').classList.remove('mobility-stale');$('mobility-run').disabled=true;$('mobility-cancel').hidden=false;
  $('mobility-progress').hidden=false;$('mobility-progress').max=Math.max(1,state.vms.length);$('mobility-progress').value=0;$('mobility-status').textContent='Assessing VM destinations…';
  try{
    const embedded=$('mobility-worker-source');let url;
    if(embedded){url=URL.createObjectURL(new Blob([embedded.textContent],{type:'text/javascript'}));try{mobilityWorker=new Worker(url);}finally{URL.revokeObjectURL(url);}}
    else mobilityWorker=new Worker(new URL('./mobility-worker.mjs',import.meta.url),{type:'module'});
    const job=mobilityWorker;
    job.onmessage=({data})=>{
      if(job!==mobilityWorker)return;
      if(data.type==='progress'){$('mobility-progress').value=data.done;$('mobility-status').textContent=`Assessed ${data.done} / ${data.total} VMs`;return;}
      if(data.type==='error'){stopMobility();$('mobility-status').textContent=`Assessment failed: ${data.message}`;return;}
      if(data.type!=='complete')return;
      mobilityRows=data.rows;stopMobility();
      if(mobilityKey!==mobilityFingerprint(state)){checkMobilityFreshness();return;}
      const count=status=>mobilityRows.filter(r=>r.status===status).length;
      $('mobility-summary').textContent=`${count('blocked')} blocked · ${count('limited')} limited · ${count('movable')} movable · ${count('unplaced')} unplaced (not assessed)`;
      $('mobility-status').textContent=`Assessment complete · affinity rules ${mobilitySnapshot.affinityEnabled?'on':'off'} · maintenance hosts excluded`;
      $('mobility-results').hidden=false;renderMobilityRows();
    };
    job.onerror=()=>{if(job!==mobilityWorker)return;stopMobility();$('mobility-status').textContent='Assessment could not run. Check that this app is served over localhost and Web Workers are permitted.';};
    mobilityWorker.postMessage(mobilitySnapshot);
  }catch(error){stopMobility();$('mobility-status').textContent=`Assessment could not start: ${error.message}`;}
});

fillForm(); render(); save();
