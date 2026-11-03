const finite=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
const query=(environment,media)=>{try{return environment.matchMedia?.(media)?.matches===true;}catch{return false;}};

/** Input capabilities and viewport select a rendering budget, never a claimed GPU tier. */
export function detectDeviceProfile(environment=globalThis){
  const width=finite(environment.innerWidth,1),height=finite(environment.innerHeight,1),touchPoints=Math.max(0,Number(environment.navigator?.maxTouchPoints)||0);
  const coarsePointer=query(environment,'(pointer: coarse)'),hoverNone=query(environment,'(hover: none)'),finePointer=query(environment,'(pointer: fine)'),hoverCapable=query(environment,'(hover: hover)');
  const compactTouch=coarsePointer&&hoverNone&&!finePointer&&!hoverCapable&&touchPoints>0&&Math.min(width,height)<=1024&&Math.max(width,height)<=1600;
  return{deviceTier:compactTouch?'mobile':'desktop',coarsePointer,hoverNone,touchPoints,width,height,reason:compactTouch?'compact-primary-touch':'desktop-or-hybrid-input'};
}

export function budgetPixelRatio({width,height,devicePixelRatio=1,maxRatio,pixelBudget=null}){
  const area=finite(width,1)*finite(height,1),physical=finite(devicePixelRatio,1);
  return Math.min(physical,maxRatio,pixelBudget?Math.sqrt(pixelBudget/area):Infinity);
}

export function mobileRenderBudget({preference='auto',reduced=false,width,height,devicePixelRatio=1}){
  const details=preference==='clear',flow=preference==='flow';
  const pixelBudget=details?1050000:flow?500000:reduced?400000:700000;
  const maxRatio=details?1.25:flow?.85:reduced?.75:1;
  const pixelRatio=budgetPixelRatio({width,height,devicePixelRatio,maxRatio,pixelBudget});
  return{pixelRatio,pixelBudget,maxRatio,shadows:details,shadowHz:details?12:0};
}

/** Use this before creating/sizing WebGLRenderer so retina DPR never allocates a huge initial buffer. */
export function initialRendererConfiguration(environment=globalThis){
  const device=detectDeviceProfile(environment),mobile=device.deviceTier==='mobile';
  const budget=mobile?mobileRenderBudget({width:device.width,height:device.height,devicePixelRatio:environment.devicePixelRatio}):null;
  return{deviceTier:device.deviceTier,antialias:!mobile,powerPreference:mobile?'low-power':'high-performance',pixelRatio:budget?.pixelRatio??Math.min(finite(environment.devicePixelRatio,1),1.65),shadows:!mobile,pixelBudget:budget?.pixelBudget??null};
}
