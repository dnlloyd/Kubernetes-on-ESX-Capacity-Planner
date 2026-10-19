import {defaults as currentDefaults,defaultCluster} from '../model.mjs';
export function defaults(){
  const s=currentDefaults();s.affinityEnabled=true;
  s.host={cpu:64,memory:512,sockets:2,coresPerSocket:16,numaNodes:2,hyperthreading:true};s.hosts=[3,3,3];
  s.clusters=[defaultCluster('k8s-1','Kubernetes cluster 1'),defaultCluster('k8s-2','Kubernetes cluster 2')];
  for(const c of s.clusters){c.profiles.worker={count:186,cpu:12,memory:120};c.deductions={nodeCpu:0.5,nodeMemoryGiB:(92677260*1024-85861471162)/2**30,servicesCpu:56.295,servicesMemoryGiB:244.075};}
  return s;
}
