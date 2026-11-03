const clone=value=>JSON.parse(JSON.stringify(value));
export function frameSummary(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.floor((sorted.length-1)*p)],mean=values.reduce((a,b)=>a+b,0)/values.length;
  return{samples:values.length,meanMs:mean,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),maxMs:sorted.at(-1),over50Percent:values.filter(ms=>ms>50).length/values.length*100};
}
/** Opt-in actual game RAF samples. No timers, uploads or diagnostic work while idle. */
export function createPerformanceCapture({clock=()=>performance.now(),getContext=()=>({}),isVisible=()=>globalThis.document?.visibilityState!=='hidden',onComplete=()=>{}}={}){
  let report=null,started=0,deadline=0,nextContext=0,first=true;
  const qualityKey=context=>JSON.stringify([context.quality?.active,context.quality?.pixelRatio,context.quality?.shadows,context.framebuffer]);
  const finish=(status,reason='')=>{if(!report||report.status!=='measuring')return;report.status=status;report.reason=reason;report.completedAt=new Date().toISOString();report.elapsedMs=clock()-started;report.summary=frameSummary(report.frames.map(frame=>frame.intervalMs));report.final=clone(getContext());report.fixedQuality=report.contexts.every(context=>qualityKey(context)===qualityKey(report.initial));onComplete(status);};
  return{
    start(seconds=20){
      if(report?.status==='measuring')return false;if(!isVisible())return false;
      if(!Number.isFinite(seconds)||seconds<1||seconds>60)throw Error('測量長度須介於 1～60 秒。');
      started=clock();deadline=started+seconds*1000;nextContext=started;first=true;
      report={schemaVersion:1,kind:'muscle-base-manual-raf',appVersion:'0.15.0',status:'measuring',startedAt:new Date().toISOString(),requestedSeconds:seconds,initial:clone(getContext()),contexts:[],frames:[],limits:['Actual game requestAnimationFrame intervals; not isolated GPU time or proof of displayed FPS.','Manual camera, route and activity; only compare matching settings and routes.','This report stays in the browser until explicitly downloaded.']};return true;
    },
    record(intervalMs){
      if(report?.status!=='measuring')return;if(!isVisible()){finish('interrupted','分頁離開前景，請保持遊戲可見後重測。');return;}
      const now=clock();if(first){first=false;return;}if(Number.isFinite(intervalMs)&&intervalMs>0)report.frames.push({t:now-started,intervalMs});
      if(now>=nextContext){report.contexts.push({...clone(getContext()),t:now-started});nextContext=now+1000;}
      if(now>=deadline)finish('complete');
    },
    cancel(reason='已停止測量。'){finish('interrupted',reason);},
    getStatus(){return{status:report?.status||'idle',samples:report?.frames.length||0,elapsedMs:report?.status==='measuring'?clock()-started:report?.elapsedMs||0,summary:report?.summary||null,reason:report?.reason||'',fixedQuality:report?.fixedQuality??null};},
    getReport(){return report?clone(report):null;},
  };
}
