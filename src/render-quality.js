import {detectDeviceProfile,mobileRenderBudget} from './device-profile-v016.js';
const profiles={flow:{ratio:.85,shadows:false,shadowHz:0},balanced:{ratio:1.25,shadows:true,shadowHz:12},clear:{ratio:1.65,shadows:true,shadowHz:30}};
export function createRenderQuality({renderer,environment=globalThis}){
  let preference='auto';try{preference=environment.localStorage?.getItem('form.graphics-quality.v1')||'auto';}catch{}
  if(!['auto','flow','clear'].includes(preference))preference='auto';
  const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info'),gpu=String(extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
  const software=/swiftshader|llvmpipe|lavapipe|software|basic render/i.test(gpu);
  let active='',autoLow=software,frameMs=0,cpuMs=0,renderMs=0,samples=0,lastShadow=-Infinity,longFrameShare=0,pressureFrames=0,autoReason=software?'software':null;
  let device=detectDeviceProfile(environment),currentBudget=null,appliedKey='',appliedTier='';
  function apply(force=false){
    device=detectDeviceProfile(environment);const mobile=device.deviceTier==='mobile';
    const next=preference==='auto'?(autoLow||mobile?'flow':'balanced'):preference;
    if(!force&&!mobile&&appliedTier==='desktop'&&next===active)return;
    const p=mobile?mobileRenderBudget({preference,reduced:autoLow,width:device.width,height:device.height,devicePixelRatio:environment.devicePixelRatio}):{pixelRatio:Math.min(environment.devicePixelRatio||1,profiles[next].ratio),pixelBudget:null,maxRatio:profiles[next].ratio,shadows:profiles[next].shadows,shadowHz:profiles[next].shadowHz};
    const key=JSON.stringify([next,device.deviceTier,p.pixelRatio,p.shadows,p.shadowHz,environment.innerWidth,environment.innerHeight]);if(!force&&key===appliedKey)return;
    const presetChanged=next!==active||device.deviceTier!==appliedTier||p.shadows!==currentBudget?.shadows||p.shadowHz!==currentBudget?.shadowHz;
    active=next;currentBudget=p;appliedKey=key;appliedTier=device.deviceTier;renderer.setPixelRatio(p.pixelRatio);
    renderer.setSize(environment.innerWidth,environment.innerHeight);if(presetChanged){renderer.shadowMap.enabled=p.shadows;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;}
  }
  apply();
  return{
    get active(){return active;},
    get preference(){return preference;},
    get deviceTier(){return device.deviceTier;},
    get mobileReduced(){return device.deviceTier==='mobile'&&preference==='auto'&&autoLow;},
    setPreference(value){if(!['auto','flow','clear'].includes(value))return false;preference=value;autoLow=software;samples=0;longFrameShare=0;pressureFrames=0;autoReason=software?'software':null;try{environment.localStorage?.setItem('form.graphics-quality.v1',value);}catch{}apply();return true;},
    recordFrame(ms){if(!Number.isFinite(ms)||ms<1||ms>250)return;frameMs=frameMs?frameMs*.95+ms*.05:ms;samples++;if(preference==='auto'&&!autoLow){longFrameShare=longFrameShare*.95+(ms>33.5?.05:0);const pressure=frameMs>21||(frameMs>18&&longFrameShare>.1);pressureFrames=pressure?pressureFrames+1:Math.max(0,pressureFrames-2);if(samples>90&&pressureFrames>=12){autoLow=true;autoReason=frameMs>21?'sustained-frame-time':'long-frames';apply();}}},
    observe(cpu,render){cpuMs=cpuMs?cpuMs*.95+cpu*.05:cpu;if(Number.isFinite(render))renderMs=renderMs?renderMs*.95+render*.05:render;},
    beforeRender(time,running=false){const p=currentBudget,hz=device.deviceTier==='mobile'?p.shadowHz:running?Math.max(24,p.shadowHz):p.shadowHz;if(p.shadows&&time-lastShadow>=1/hz){renderer.shadowMap.needsUpdate=true;lastShadow=time;}},
    resize(){apply(true);},
    diagnostics(){const ratio=renderer.getPixelRatio();return{preference,active,softwareRendering:software,renderer:gpu,pixelRatio:ratio,shadows:renderer.shadowMap.enabled,shadowHz:currentBudget.shadowHz,frameMs,fps:frameMs?1000/frameMs:0,cpuMs,renderMs,frameSamples:samples,autoReason:preference==='auto'&&device.deviceTier==='mobile'&&!autoReason?'mobile-budget':autoReason,deviceTier:device.deviceTier,pixelBudget:currentBudget.pixelBudget,maxPixelRatio:currentBudget.maxRatio,framebufferPixels:Math.floor(device.width*ratio)*Math.floor(device.height*ratio),mobileReduced:device.deviceTier==='mobile'&&preference==='auto'&&autoLow,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
  };
}
