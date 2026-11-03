/** Read camera framing geometry only when the panel, viewport or layout changes.
 * Text/progress animation must not force a layout read on every game frame. */
export function createCameraPanelLayout({document,environment=globalThis}){
 let dirty=true,activeKey=null,width=0,height=0,result={offsetX:0,offsetY:0},reads=0,panel=null,header=null,observedPanel,observedHeader;
 const invalidate=()=>{dirty=true;},RO=environment.ResizeObserver,MO=environment.MutationObserver;
 const resize=RO?new RO(invalidate):null,attributes=MO?new MO(invalidate):null,tree=MO?new MO(invalidate):null;
 tree?.observe(document.querySelector('#app')||document.body,{childList:true});
 function observe(){if(panel===observedPanel&&header===observedHeader)return;observedPanel=panel;observedHeader=header;resize?.disconnect();attributes?.disconnect();if(document.body)attributes?.observe(document.body,{attributes:true,attributeFilter:['class','style']});for(const element of [panel,header])if(element){resize?.observe(element);attributes?.observe(element,{attributes:true,attributeFilter:['class','style','hidden']});}}
 environment.addEventListener?.('resize',invalidate);environment.visualViewport?.addEventListener('resize',invalidate);
 return{read(active){const w=environment.innerWidth,h=environment.innerHeight;if(w!==width||h!==height||active!==activeKey||panel?.isConnected===false||header?.isConnected===false)dirty=true;if(!dirty)return result;dirty=false;width=w;height=h;activeKey=active;reads++;
   const mobile=document.body.classList.contains('has-mobile-controls');panel=active&&(w>650||mobile)?document.querySelector('.station-panel'):null;header=mobile?document.querySelector('.topbar'):null;observe();const rect=panel?.getBoundingClientRect(),side=rect&&(!mobile||rect.top<h*.25&&rect.width<w*.6),bottom=header?.getBoundingClientRect().bottom||0;result={offsetX:side?(w-rect.left)/2:0,offsetY:rect&&mobile&&!side?Math.max(0,h/2-(bottom+rect.top)/2):0};return result;
  },invalidate,getDiagnostics(){return{reads,dirty};},dispose(){resize?.disconnect();attributes?.disconnect();tree?.disconnect();environment.removeEventListener?.('resize',invalidate);environment.visualViewport?.removeEventListener('resize',invalidate);}};
}
