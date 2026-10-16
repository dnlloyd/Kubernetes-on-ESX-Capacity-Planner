export const TYPES = ['etcd', 'master', 'ingress', 'worker'];
export const AZS = ['AZ1', 'AZ2', 'AZ3'];
export const REGION_TYPES = { presentation: 'Presentation tier', mid: 'Mid-tier' };
export function defaultDeductions() { return {nodeCpu:0.5,nodeMemoryGiB:(92677260*1024-85861471162)/2**30,servicesCpu:56.295,servicesMemoryGiB:244.075}; }
export function defaultCluster(id, label) {
  return { id, label, deductions:defaultDeductions(), profiles: {
    etcd: { count: 5, cpu: 4, memory: 16 }, master: { count: 3, cpu: 6, memory: 32 },
    ingress: { count: 3, cpu: 6, memory: 16 }, worker: { count: 186, cpu: 12, memory: 120 }
  } };
}
export function defaults() {
  return { schemaVersion: 6, title: 'Untitled scenario', affinityEnabled: true, regionType: 'presentation', host: { cpu: 64, memory: 512, sockets: 2, coresPerSocket: 16, numaNodes: 2, hyperthreading: true }, hosts: [3, 3, 3],
    clusters: [defaultCluster('k8s-1', 'Kubernetes cluster 1'), defaultCluster('k8s-2', 'Kubernetes cluster 2')], vms: [] };
}
function positive(n, integer = false) { return Number.isFinite(n) && n > 0 && n <= 1000000 && (!integer || Number.isInteger(n)); }
export function logicalCores(host) { return host.sockets * host.coresPerSocket * (host.hyperthreading ? 2 : 1); }
export function scenarioFilename(title) {
  const name=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return `${name||'scenario'}.json`;
}
export function validateConfig(s) {
  if (typeof s?.title !== 'string' || !s.title.trim() || s.title.length>120) throw Error('Give the scenario a title of 1–120 characters.');
  if (typeof s?.affinityEnabled !== 'boolean') throw Error('Placement rules must be on or off.');
  if (!s || !positive(s.host?.cpu, true) || !positive(s.host?.memory)) throw Error('Enter positive host logical CPU cores and memory (up to 1,000,000).');
  if (!positive(s.host.sockets,true) || !positive(s.host.coresPerSocket,true) || typeof s.host.hyperthreading!=='boolean') throw Error('Enter positive whole-number sockets and physical cores per socket, and select hyperthreading Active or Inactive.');
  if (!Number.isInteger(s.host.numaNodes) || s.host.numaNodes<1 || s.host.numaNodes>64 || (s.host.sockets*s.host.coresPerSocket)%s.host.numaNodes!==0) throw Error('NUMA nodes per host must be 1–64 and divide the host physical core count evenly.');
  if (s.host.cpu !== logicalCores(s.host)) throw Error('Logical cores must equal sockets × physical cores per socket × threads per core (2 when hyperthreading is active, otherwise 1).');
  if (!Array.isArray(s.hosts) || s.hosts.length !== 3 || !s.hosts.every(n => positive(n, true) && n <= 10000)) throw Error('Each AZ needs 1–10,000 hosts.');
  if (!Object.hasOwn(REGION_TYPES, s.regionType)) throw Error('Choose Presentation tier or Mid-tier for the region.');
  if (!Array.isArray(s.clusters) || !s.clusters.length || s.clusters.length > 2) throw Error('Define one or two Kubernetes clusters.');
  let total = 0;
  const ids = new Set();
  for (const cluster of s.clusters) {
    if (!cluster || typeof cluster.id !== 'string' || !/^k8s-[a-zA-Z0-9-]{1,64}$/.test(cluster.id) || ids.has(cluster.id)) throw Error('Kubernetes clusters need unique valid IDs.');
    ids.add(cluster.id);
    const deductions=cluster.deductions??defaultDeductions();
    if (!['nodeCpu','nodeMemoryGiB','servicesCpu','servicesMemoryGiB'].every(k=>Number.isFinite(deductions[k])&&deductions[k]>=0&&deductions[k]<=1000000)) throw Error('Capacity deductions must be numbers between 0 and 1,000,000.');
    if (typeof cluster.label !== 'string' || !cluster.label.trim() || cluster.label.length > 80) throw Error('Give each Kubernetes cluster a label of 1–80 characters.');
    for (const type of TYPES) {
      const p = cluster.profiles?.[type];
      if (!p || !Number.isInteger(p.count) || p.count < 0 || !positive(p.cpu) || !positive(p.memory)) throw Error('VM counts must be whole numbers at or above zero; CPU and memory must be positive.');
      total += p.count;
    }
  }
  if (total < 1 || total > 3000) throw Error('Define between 1 and 3,000 VMs across the region.');
  return true;
}
export function reconcile(config, previous = [], {balanceWorkers=true}={}) {
  validateConfig(config);
  const old = new Map(previous.map(v => [v.id, v]));
  const vms = [];
  for (const cluster of config.clusters) for (const type of TYPES) for (let i = 1; i <= cluster.profiles[type].count; i++) {
    const name = `${type}-${String(i).padStart(2, '0')}`;
    const id = `${cluster.id}:${name}`;
    const prior = old.get(id);
    const az = prior?.az ?? ((i - 1) % 3);
    vms.push({ id, clusterId: cluster.id, name, type, az, host: prior?.host ?? null });
  }
  return assignHosts({ ...config, schemaVersion: 6, vms }, {balanceWorkers});
}
export function profileFor(state, vm) { return state.clusters.find(c => c.id === vm.clusterId).profiles[vm.type]; }
export function usage(state, az) {
  const vms = state.vms.filter(v => v.az === az);
  const cpu = vms.reduce((n, v) => n + profileFor(state, v).cpu, 0);
  const memory = vms.reduce((n, v) => n + profileFor(state, v).memory, 0);
  const availableHosts = Math.max(0, state.hosts[az] - 1);
  const capacity = { cpu: state.host.cpu * availableHosts, memory: state.host.memory * availableHosts };
  return { vms, cpu, memory, capacity, over: cpu > capacity.cpu || memory > capacity.memory };
}
export function hostName(az, index) { return `az${az+1}${String(index+1).padStart(2,'0')}`; }
export function hostUsage(state, az, host) {
  const vms = state.vms.filter(v=>v.az===az && v.host===host);
  const cpu=vms.reduce((n,v)=>n+profileFor(state,v).cpu,0);
  const memory=vms.reduce((n,v)=>n+profileFor(state,v).memory,0);
  return {vms,cpu,memory,capacity:{...state.host},over:cpu>state.host.cpu || memory>state.host.memory};
}
export function pairedVM(state, vm) {
  if(!['master','ingress'].includes(vm.type))return null;
  const other=vm.type==='master'?'ingress':'master';
  return state.vms.find(v=>v.clusterId===vm.clusterId&&v.name===vm.name.replace(vm.type,other))??null;
}
export function assignHosts(state) {
  const next=structuredClone(state);delete next.dedications;
  // Host assignments are calculated each time, never affinity/pinning metadata.
  next.vms.forEach(v=>{v.host=null;delete v.pinned;});
  if(!next.affinityEnabled) {
    for(let az=0;az<3;az++) {
      const loads=Array.from({length:next.hosts[az]},(_,host)=>({host,cpu:0,memory:0,count:0}));
      const members=next.vms.filter(v=>v.az===az).sort((a,b)=>profileFor(next,b).cpu-profileFor(next,a).cpu || profileFor(next,b).memory-profileFor(next,a).memory || a.id.localeCompare(b.id));
      for(const vm of members) {
        const p=profileFor(next,vm);
        loads.sort((a,b)=>Number(a.cpu+p.cpu>next.host.cpu||a.memory+p.memory>next.host.memory)-Number(b.cpu+p.cpu>next.host.cpu||b.memory+p.memory>next.host.memory) || a.cpu-b.cpu || a.memory-b.memory || a.count-b.count || a.host-b.host);
        const l=loads[0];vm.host=l.host;l.cpu+=p.cpu;l.memory+=p.memory;l.count++;
      }
    }
    return next;
  }
  for(const vm of next.vms.filter(v=>v.type==='ingress')) {const mate=pairedVM(next,vm);if(mate)vm.az=mate.az;}
  for(let az=0;az<3;az++) {
    const loads=Array.from({length:next.hosts[az]},(_,host)=>({host,cpu:0,memory:0,pair:0,etcd:0,worker:0}));
    const add=(vm,l)=>{const p=profileFor(next,vm);vm.host=l.host;l.cpu+=p.cpu;l.memory+=p.memory;l[vm.type==='etcd'?'etcd':vm.type==='worker'?'worker':'pair']++;};
    const choose=(pool,vms)=>{
      const cpu=vms.reduce((n,v)=>n+profileFor(next,v).cpu,0),memory=vms.reduce((n,v)=>n+profileFor(next,v).memory,0);
      return pool.sort((a,b)=>Number(a.cpu+cpu>next.host.cpu||a.memory+memory>next.host.memory)-Number(b.cpu+cpu>next.host.cpu||b.memory+memory>next.host.memory) || a.cpu-b.cpu || a.memory-b.memory || a.host-b.host)[0];
    };
    const members=next.vms.filter(v=>v.az===az);
    for(const master of members.filter(v=>v.type==='master')) {
      const mate=pairedVM(next,master);if(!mate)continue;
      const l=choose(loads.filter(l=>l.pair===0),[master,mate]);
      if(l){add(master,l);add(mate,l);}
    }
    for(const etcd of members.filter(v=>v.type==='etcd')) {
      const l=choose(loads.filter(l=>l.etcd===0),[etcd]);if(l)add(etcd,l);
    }
    // Interleave clusters to avoid giving the first cluster all scarce worker slots.
    const queues=next.clusters.map(c=>members.filter(v=>v.type==='worker'&&v.clusterId===c.id));
    for(let i=0;i<Math.max(0,...queues.map(q=>q.length));i++)for(const q of queues) {
      const vm=q[i];if(!vm)continue;
      const l=choose(loads.filter(l=>l.worker<(l.pair?1:2)),[vm]);if(l)add(vm,l);
    }
  }
  return next;
}
export function affinitySummary(state,az) {
  const members=state.vms.filter(v=>v.az===az),pairs=members.filter(v=>v.type==='master'&&pairedVM(state,v)).length;
  const workers=members.filter(v=>v.type==='worker').length,etcd=members.filter(v=>v.type==='etcd').length;
  const unpaired=state.affinityEnabled?members.filter(v=>['master','ingress'].includes(v.type)&&!pairedVM(state,v)):[];
  const unplaced=members.filter(v=>v.host===null);
  const minimumHosts=state.affinityEnabled?Math.max(etcd,pairs,Math.ceil((workers+pairs)/2)):1;
  return {unplaced,unpaired,pairs,workers,minimumHosts,workerSlots:2*state.hosts[az]-Math.min(pairs,state.hosts[az])};
}
export function distribute(state) {
  const next=structuredClone(state);
  const totals=[0,0,0],cpus=[0,0,0],memories=[0,0,0];
  const groups=state.clusters.flatMap(cluster=>TYPES.map(type=>({cluster,type,profile:cluster.profiles[type]})));
  groups.sort((a,b)=>b.profile.cpu-a.profile.cpu || b.profile.memory-a.profile.memory);
  for(const {cluster,type,profile} of groups) {
    const counts=[0,0,0];
    for(const vm of next.vms.filter(v=>v.clusterId===cluster.id&&v.type===type)) {
      const az=[0,1,2].sort((a,b)=>counts[a]-counts[b] || totals[a]-totals[b] || cpus[a]-cpus[b] || memories[a]-memories[b] || a-b)[0];
      if(vm.az!==az)vm.host=null;
      vm.az=az;counts[az]++;totals[az]++;cpus[az]+=profile.cpu;memories[az]+=profile.memory;
    }
  }
  return assignHosts(next,{balanceWorkers:true});
}
export function validateState(s) {
  validateConfig(s);
  if (s.schemaVersion !== 6 || !Array.isArray(s.vms)) throw Error('Scenario version or VM placements are invalid.');
  const expected = reconcile(s).vms;
  const ids = new Set();
  if (s.vms.length !== expected.length) throw Error('VM placements do not match the configured counts.');
  const lookup = new Map(expected.map(v => [v.id, v]));
  for (const v of s.vms) {
    const match = lookup.get(v?.id);
    if (!match || match.type !== v.type || match.clusterId !== v.clusterId || match.name !== v.name || ids.has(v.id) || ![0,1,2].includes(v.az) || (v.host!==null && (!Number.isInteger(v.host) || v.host<0 || v.host>=s.hosts[v.az]))) throw Error('Scenario contains invalid or duplicate VM placements.');
    ids.add(v.id);
  }
  if(!s.affinityEnabled)return true;
  for(const vm of s.vms) {
    const mate=pairedVM(s,vm);
    if(mate&&(mate.az!==vm.az||mate.host!==vm.host))throw Error('Master/ingress pairs must share an AZ and ESX host.');
    if(['master','ingress'].includes(vm.type)&&!mate&&vm.host!==null)throw Error('Unpaired master/ingress VMs must remain unplaced.');
  }
  for(let az=0;az<3;az++)for(const host of new Set(s.vms.filter(v=>v.az===az&&v.host!==null).map(v=>v.host))) {
    const vms=s.vms.filter(v=>v.az===az&&v.host===host),n=t=>vms.filter(v=>v.type===t).length;
    if(n('etcd')>1||n('master')>1||n('ingress')>1||n('worker')>(n('master')||n('ingress')?1:2))throw Error('Scenario violates host affinity occupancy limits.');
  }
  return true;
}
export function normalizeState(source) {
  let s=structuredClone(source);
  if(s&&!Object.hasOwn(s,'title'))s.title='Untitled scenario';
  if(typeof s?.title==='string')s.title=s.title.trim();
  if(s&&!Object.hasOwn(s,'affinityEnabled'))s.affinityEnabled=true;
  if(Array.isArray(s?.clusters))s.clusters=s.clusters.map(c=>c?{...c,deductions:c.deductions??defaultDeductions()}:c);
  if(s?.host) s.host={...s.host,sockets:Object.hasOwn(s.host,'sockets')?s.host.sockets:2,hyperthreading:Object.hasOwn(s.host,'hyperthreading')?s.host.hyperthreading:true,numaNodes:Object.hasOwn(s.host,'numaNodes')?s.host.numaNodes:2};
  if(s?.profiles&&!s.clusters&&Array.isArray(s.vms)) {
    s={...s,schemaVersion:2,regionType:'presentation',clusters:[{id:'k8s-1',label:'Kubernetes cluster 1',profiles:s.profiles}],vms:s.vms.map(v=>({...v,name:v.id,id:`k8s-1:${v.id}`,clusterId:'k8s-1'}))};
  }
  // Keep saved scenarios and older exports compatible with the role rename.
  if(Array.isArray(s?.clusters))for(const cluster of s.clusters) {
    if(cluster?.profiles&&Object.hasOwn(cluster.profiles,'public')) {
      if(Object.hasOwn(cluster.profiles,'ingress'))throw Error('Scenario contains both public and ingress profiles; keep only one role profile.');
      cluster.profiles.ingress=cluster.profiles.public;
      delete cluster.profiles.public;
    }
  }
  if(Array.isArray(s?.vms))s.vms=s.vms.map(v=>v?.type==='public'?{...v,type:'ingress',name:typeof v.name==='string'?v.name.replace(/^public-/,'ingress-'):v.name,id:typeof v.id==='string'?v.id.replace(/(^|:)public-/,'$1ingress-'):v.id}:v);
  if([2,3,4,5].includes(s?.schemaVersion)) {
    if (!Object.hasOwn(s.host,'coresPerSocket')) s.host.coresPerSocket=s.host.cpu/(s.host.sockets*(s.host.hyperthreading?2:1));
    s={...s,schemaVersion:6,vms:s.vms.map(v=>({id:v.id,clusterId:v.clusterId,name:v.name,type:v.type,az:v.az,host:null}))};
    validateConfig(s);s=assignHosts(s);
  }
  validateState(s);
  return {schemaVersion:6,title:s.title,affinityEnabled:s.affinityEnabled,regionType:s.regionType,host:{cpu:s.host.cpu,memory:s.host.memory,sockets:s.host.sockets,coresPerSocket:s.host.coresPerSocket,numaNodes:s.host.numaNodes,hyperthreading:s.host.hyperthreading},hosts:[...s.hosts],
    clusters:s.clusters.map(c=>({id:c.id,label:c.label.trim(),deductions:{...(c.deductions??defaultDeductions())},profiles:Object.fromEntries(TYPES.map(t=>[t,{count:c.profiles[t].count,cpu:c.profiles[t].cpu,memory:c.profiles[t].memory}]))})),
    vms:s.vms.map(v=>({id:v.id,clusterId:v.clusterId,name:v.name,type:v.type,az:v.az,host:v.host}))};
}

// Derived planning estimate only: largest-memory-first placement, balanced CPU,
// equal node resources, full configured RAM, no overhead or ESXi telemetry.
export function numaPlan(state, az, host) {
  const count=state.host.numaNodes, physical=state.host.sockets*state.host.coresPerSocket/count;
  const capacity={physical,logical:state.host.cpu/count,memory:state.host.memory/count};
  const nodes=Array.from({length:count},(_,id)=>({id,cpu:0,memory:0})), placements=new Map();
  const vms=hostUsage(state,az,host).vms.sort((a,b)=>profileFor(state,b).memory-profileFor(state,a).memory || profileFor(state,b).cpu-profileFor(state,a).cpu || a.id.localeCompare(b.id));
  for(const vm of vms) {
    const p=profileFor(state,vm), wide=p.cpu>physical;
    const fitting=nodes.filter(n=>n.memory+p.memory<=capacity.memory+1e-8);
    const candidates=fitting.length?fitting:[...nodes];
    candidates.sort((a,b)=>a.cpu-b.cpu || a.memory-b.memory || a.id-b.id);
    const home=candidates[0];
    const memoryByNode=Array(count).fill(0),cpuByNode=Array(count).fill(0);
    let remaining=p.memory;
    const local=Math.max(0,Math.min(remaining,capacity.memory-home.memory));
    home.memory+=local;memoryByNode[home.id]+=local;remaining-=local;
    const remote=p.memory-local;
    for(const node of [...nodes].filter(n=>n!==home).sort((a,b)=>a.memory-b.memory || a.id-b.id)) {
      const amount=Math.max(0,Math.min(remaining,capacity.memory-node.memory));
      node.memory+=amount;memoryByNode[node.id]+=amount;remaining-=amount;
    }
    // Retain overflow visibly instead of pretending RAM fits within host capacity.
    if(remaining>0){home.memory+=remaining;memoryByNode[home.id]+=remaining;}
    const cpuNodes=wide?[home,...nodes.filter(n=>n!==home).sort((a,b)=>a.cpu-b.cpu || a.id-b.id)]:[home];
    let cpu=p.cpu;
    const allocations=[];
    for(const node of cpuNodes) {
      const amount=wide?Math.min(cpu,physical):cpu;
      if(amount>0){node.cpu+=amount;cpuByNode[node.id]+=amount;allocations.push(node.id);cpu-=amount;}
    }
    if(cpu>0){home.cpu+=cpu;cpuByNode[home.id]+=cpu;}
    placements.set(vm.id,{home:home.id,nodes:allocations,wide,remote,overflow:remaining,cpuByNode,memoryByNode});
  }
  for(const placement of placements.values()) placement.contention=placement.nodes.some(id=>nodes[id].cpu>physical+1e-8);
  const memoryRisk=[...placements.values()].some(p=>p.remote>1e-8||p.overflow>1e-8);
  const contention=nodes.some(n=>n.cpu>physical+1e-8),wide=[...placements.values()].some(p=>p.wide);
  return {capacity,nodes,placements,memoryRisk,contention,wide,status:memoryRisk||contention?'risk':wide?'wide':'fit'};
}

export function clusterCapacity(state, clusterId) {
  const members=state.vms.filter(v=>v.clusterId===clusterId);
  return {count:members.length,cpu:members.reduce((n,v)=>n+profileFor(state,v).cpu,0),memory:members.reduce((n,v)=>n+profileFor(state,v).memory,0),unplaced:members.filter(v=>v.host===null).length};
}

export function clientCapacity(state, clusterId) {
  const cluster=state.clusters.find(c=>c.id===clusterId),d=cluster.deductions??defaultDeductions();
  const workers=state.vms.filter(v=>v.clusterId===clusterId&&v.type==='worker');
  const placed=workers.filter(v=>v.host!==null).length,profile=cluster.profiles.worker;
  const grossCpu=placed*profile.cpu,grossMemoryGiB=placed*profile.memory*1e9/2**30;
  const nodeCpu=placed*d.nodeCpu,nodeMemoryGiB=placed*d.nodeMemoryGiB;
  const cpu=grossCpu-nodeCpu-d.servicesCpu,memoryGiB=grossMemoryGiB-nodeMemoryGiB-d.servicesMemoryGiB;
  return {placed,unplaced:workers.length-placed,grossCpu,grossMemoryGiB,nodeCpu,nodeMemoryGiB,
    allocatableCpu:Math.max(0,grossCpu-nodeCpu),allocatableMemoryGiB:Math.max(0,grossMemoryGiB-nodeMemoryGiB),
    cpu:Math.max(0,cpu),memoryGiB:Math.max(0,memoryGiB),overdrawn:cpu<0||memoryGiB<0,
    nodeOverdrawn:d.nodeCpu>profile.cpu||d.nodeMemoryGiB>profile.memory*1e9/2**30};
}

export function capacityCsv(state) {
  const rows=[['Region title','Kubernetes cluster','Section','Metric / VM type','VM count','Unplaced VM count','CPU (vCPU)','Memory (GB)','Memory (GiB)']];
  for(const cluster of state.clusters) {
    const total=clusterCapacity(state,cluster.id),worker=clientCapacity(state,cluster.id),d=cluster.deductions??defaultDeductions();
    const add=(section,metric,count,unplaced,cpu,gb,gib)=>rows.push([state.title,cluster.label,section,metric,count,unplaced,cpu,gb,gib]);
    add('Client workload summary','Available for client workloads',worker.placed,worker.unplaced,worker.cpu,'',worker.memoryGiB);
    add('Client workload calculation','Placed workers, gross',worker.placed,worker.unplaced,worker.grossCpu,'',worker.grossMemoryGiB);
    add('Client workload calculation','Node reservations (deduct)', '', '',worker.nodeCpu,'',worker.nodeMemoryGiB);
    add('Client workload calculation','Cluster services (deduct)', '', '',d.servicesCpu,'',d.servicesMemoryGiB);
    add('Client workload calculation','Client workload budget',worker.placed,worker.unplaced,worker.cpu,'',worker.memoryGiB);
    for(const type of TYPES) {
      const p=cluster.profiles[type],unplaced=state.vms.filter(v=>v.clusterId===cluster.id&&v.type===type&&v.host===null).length;
      add('Configured VM totals',type,p.count,unplaced,p.count*p.cpu,p.count*p.memory,'');
    }
    add('Configured VM totals','Total',total.count,total.unplaced,total.cpu,total.memory,'');
  }
  const cell=value=>{
    if(typeof value==='number')return String(Number(value.toFixed(6)));
    const text=String(value??'');
    const safe=/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text)?"'"+text:text;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
