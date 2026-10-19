import {vmMobility} from './model.mjs';
self.onmessage=({data:state})=>{
  try {
    const rows=[],total=state.vms.length,step=Math.max(1,Math.ceil(total/100));
    for(const row of vmMobility(state)){
      rows.push(row);
      if(rows.length%step===0)self.postMessage({type:'progress',done:rows.length,total});
    }
    self.postMessage({type:'complete',rows});
  } catch(error){self.postMessage({type:'error',message:error.message});}
};
