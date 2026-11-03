export function frameStatistics(values){
 if(!Array.isArray(values)||!values.length||values.some(value=>!Number.isFinite(value)||value<=0))throw Error('Expected non-empty positive finite frame intervals.');
 const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.floor((sorted.length-1)*p)];
 return{samples:values.length,meanMs:values.reduce((sum,value)=>sum+value,0)/values.length,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),over25Percent:values.filter(value=>value>25).length/values.length*100,over50Percent:values.filter(value=>value>50).length/values.length*100};
}
export function hardwareRenderer(value){return typeof value==='string'&&value.length>0&&!/swiftshader|llvmpipe|lavapipe|software|basic render/i.test(value);}
export function fixedProfileSettings(setup,profile){
 const quality=setup?.quality,expected=profile==='flow'?[1088,680]:profile==='clear'?[1280,800]:null;
 if(!expected||!hardwareRenderer(setup?.renderer)||JSON.stringify(setup.framebuffer)!==JSON.stringify(expected)||quality?.active!==profile||quality.shadows!==(profile==='clear')||Math.abs(quality.pixelRatio-(profile==='flow'?.85:1))>1e-6)throw Error(`Invalid native fixed-quality setup for ${profile}.`);
 return{renderer:setup.renderer,framebuffer:setup.framebuffer,active:quality.active,pixelRatio:quality.pixelRatio,shadows:quality.shadows};
}
