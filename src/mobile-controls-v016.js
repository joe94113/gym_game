import {detectDeviceProfile} from './device-profile-v016.js';
import {createTouchMovementState} from './mobile-input-v016.js';

/** Persistent touch DOM lives outside #app, so teaching renders cannot lose a hold. */
export function createMobileControls({getWorld=()=>null,getState=()=>({}),onInteract=()=>{},onExit=()=>{},onChange=()=>{},environment=globalThis,document:doc=environment.document}={}){
  const root=doc.createElement('div');root.className='mobile-controls';root.hidden=true;root.style.display='none';root.setAttribute('role','group');root.setAttribute('aria-label','手機操作');
  root.innerHTML='<button type="button" class="mobile-stick" data-mobile-stick aria-label="按住拖曳移動人物"><span class="mobile-stick-knob" aria-hidden="true"></span><span class="mobile-stick-label" aria-hidden="true">移動</span></button><div class="mobile-buttons"><button type="button" class="mobile-run" data-mobile-run aria-label="按住奔跑" aria-pressed="false">按住奔跑</button><button type="button" class="mobile-interact" data-mobile-interact disabled>靠近器材</button><button type="button" class="mobile-exit" data-mobile-exit hidden>返回探索</button></div>';
  const stick=root.querySelector('[data-mobile-stick]'),knob=root.querySelector('.mobile-stick-knob'),run=root.querySelector('[data-mobile-run]'),interact=root.querySelector('[data-mobile-interact]'),exit=root.querySelector('[data-mobile-exit]');
  stick.style.touchAction='none';run.style.touchAction='none';interact.style.touchAction='manipulation';exit.style.touchAction='manipulation';
  doc.body.append(root);
  let disposed=false,mobile=false,visible=false,using=false,profile=detectDeviceProfile(environment);
  const removers=[],listen=(target,name,callback,options)=>{target.addEventListener(name,callback,options);removers.push(()=>target.removeEventListener(name,callback,options));};
  const show=(element,value)=>{element.hidden=!value;element.style.display=value?'':'none';};
  const paint=()=>{const input=model.getState(),length=Math.hypot(input.dx,input.dy),scale=length>input.radius?input.radius/length:1;knob.style.transform=`translate(-50%, -50%) translate(${input.dx*scale}px, ${input.dy*scale}px)`;run.setAttribute('aria-pressed',String(input.running));root.classList.toggle('is-running',input.running);};
  const model=createTouchMovementState({onChange:movement=>{getWorld()?.setTouchMovement?.(movement);onChange(movement);paint();}});
  function release(element,id){if(id===null)return;try{if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);}catch{/* A cancelled pointer may already be released. */}}
  function capture(element,id){try{element.setPointerCapture?.(id);}catch{/* Window release listeners still end an uncaptured hold. */}}
  function reset(){const state=model.getState();model.reset();release(stick,state.pointerId);release(run,state.runPointerId);}
  function editable(target){return!!target?.closest?.('input,textarea,select,[contenteditable="true"]');}
  function availability(){const state=getState()||{},blocked=!!state.modal||!!state.extraPanelOpen||!!state.mobileMenuOpen||doc.body.classList.contains('mobile-menu-open')||!!doc.querySelector('dialog[open]')||editable(doc.activeElement);return{state,visible:mobile&&!!state.loaded&&!state.welcome&&!blocked&&doc.visibilityState!=='hidden'};}
  function sync(){
    if(disposed)return;profile=detectDeviceProfile(environment);mobile=profile.deviceTier==='mobile';doc.body.classList.toggle('has-mobile-controls',mobile);
    const current=availability(),state=current.state;visible=current.visible;using=!!state.active||!!state.info||!!state.closing;
    const before=model.getState();model.setEnabled(visible&&!using);if(!model.getState().enabled){release(stick,before.pointerId);release(run,before.runPointerId);}
    root.hidden=!visible;root.style.display=visible?'':'none';root.setAttribute('aria-hidden',String(!visible));root.classList.toggle('is-using',using);
    show(stick,!using);show(run,!using);show(interact,!using);show(exit,using);run.disabled=!model.getState().enabled;
    interact.disabled=!visible||using||!state.nearby;interact.textContent=state.nearby?(state.nearby.type==='facility'?'使用設施':'使用／選動作'):'靠近器材';interact.setAttribute('aria-label',state.nearby?`${interact.textContent}：${state.nearby.name||'目前位置'}`:'靠近器材後使用或選擇動作');
    exit.disabled=!!state.closing;exit.textContent=state.closing?'正在離開…':'返回探索';exit.setAttribute('aria-label','放回器材並返回探索');paint();
  }
  function prevent(event){event.preventDefault();event.stopPropagation();}
  listen(stick,'pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;sync();if(!model.getState().enabled)return;const rect=stick.getBoundingClientRect(),radius=Math.max(18,Math.min(48,Math.min(rect.width,rect.height)/2-22));if(!model.begin(event.pointerId,rect.left+rect.width/2,rect.top+rect.height/2,radius))return;prevent(event);capture(stick,event.pointerId);model.move(event.pointerId,event.clientX,event.clientY);});
  listen(stick,'pointermove',event=>{if(model.getState().pointerId!==event.pointerId)return;prevent(event);model.move(event.pointerId,event.clientX,event.clientY);});
  const finishStick=event=>{if(model.end(event.pointerId)){prevent(event);release(stick,event.pointerId);}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(stick,type,finishStick);
  listen(run,'pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;sync();if(!model.beginRun(event.pointerId))return;prevent(event);capture(run,event.pointerId);});
  const finishRun=event=>{if(model.endRun(event.pointerId)){prevent(event);release(run,event.pointerId);}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(run,type,finishRun);
  for(const type of ['pointerup','pointercancel'])listen(environment,type,event=>{finishStick(event);finishRun(event);});
  listen(run,'keydown',event=>{if(['Space','Enter'].includes(event.code)){prevent(event);model.beginRun('keyboard');}});listen(run,'keyup',event=>{if(['Space','Enter'].includes(event.code)){prevent(event);model.endRun('keyboard');}});listen(run,'blur',()=>model.endRun('keyboard'));
  for(const element of [stick,run])listen(element,'contextmenu',prevent);
  listen(interact,'click',event=>{prevent(event);const current=availability();if(!current.visible||using||!current.state.nearby)return;reset();onInteract();sync();});
  listen(exit,'click',event=>{prevent(event);const current=availability();if(!current.visible||!using||current.state.closing)return;reset();onExit();sync();});
  listen(environment,'blur',reset);listen(environment,'pagehide',reset);listen(environment,'resize',()=>{reset();sync();});listen(environment,'orientationchange',()=>{reset();sync();});
  listen(doc,'visibilitychange',()=>{if(doc.visibilityState==='hidden')reset();sync();});listen(doc,'focusin',event=>{if(editable(event.target)){reset();sync();}});listen(doc,'focusout',()=>queueMicrotask(()=>{if(!disposed)sync();}));
  for(const query of ['(pointer: coarse)','(pointer: fine)','(hover: none)','(hover: hover)']){const media=environment.matchMedia?.(query);if(!media)continue;const change=()=>{reset();sync();};if(media.addEventListener){media.addEventListener('change',change);removers.push(()=>media.removeEventListener('change',change));}else if(media.addListener){media.addListener(change);removers.push(()=>media.removeListener(change));}}
  mobile=profile.deviceTier==='mobile';doc.body.classList.toggle('has-mobile-controls',mobile);
  return{element:root,sync,reset,getDiagnostics:()=>({mobile,visible,using,...model.getState()}),dispose(){if(disposed)return;reset();disposed=true;for(const remove of removers)remove();root.remove();doc.body.classList.remove('has-mobile-controls');}};
}
