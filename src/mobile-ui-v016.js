const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Only decorates existing controls. Teaching, routing and exercise actions
 * remain the same actions used by the desktop interface. */
export function createMobileUI({app,getState,getStations=()=>[],onChange=()=>{}}){
  let menuOpen=false,collapsed=true,lastActivity=null;
  const compact=()=>document.body.classList.contains('has-mobile-controls')||innerWidth<=900;
  function apply(){
    document.body.classList.toggle('mobile-menu-open',menuOpen&&compact());
    document.body.classList.toggle('mobile-panel-collapsed',collapsed);
    const menu=app.querySelector('[data-mobile-menu-toggle]');if(menu){menu.setAttribute('aria-expanded',String(menuOpen));menu.textContent=menuOpen?'關閉選單':'功能選單';}
    const panel=app.querySelector('[data-mobile-panel-toggle]');if(panel){panel.setAttribute('aria-expanded',String(!collapsed));panel.textContent=collapsed?'展開教學 ↓':'收合教學 ↑';}
  }
  function closeMenu(){if(!menuOpen)return;menuOpen=false;apply();onChange();}
  function decorate(){
    const state=getState(),key=state.active?.id||state.info?.id||null;if(key!==lastActivity){collapsed=true;lastActivity=key;}
    if(!compact()||state.modal||state.extraPanelOpen)menuOpen=false;
    const header=app.querySelector('.topbar'),nav=header?.querySelector('.header-actions');
    if(nav&&!header.querySelector('[data-mobile-menu-toggle]')){nav.id='mobile-main-menu';const button=document.createElement('button');button.type='button';button.dataset.mobileMenuToggle='';button.setAttribute('aria-controls',nav.id);header.insertBefore(button,nav);}
    const panel=app.querySelector('.station-panel');if(panel&&!panel.querySelector('[data-mobile-panel-toggle]')){const button=document.createElement('button');button.type='button';button.dataset.mobilePanelToggle='';panel.prepend(button);}
    const map=app.querySelector('.large-map-wrap');if(map&&!map.querySelector('.mobile-map-list'))map.insertAdjacentHTML('beforeend',`<div class="mobile-map-list" aria-label="選擇前往的器材">${getStations().map(station=>`<button type="button" data-map-station="${escape(station.id)}">${escape(station.name)}</button>`).join('')}</div>`);
    const canvas=document.querySelector('#gym-canvas');if(canvas)canvas.setAttribute('aria-label',document.body.classList.contains('has-mobile-controls')?'3D 健身房；左下搖桿移動，拖曳場景轉動視角，雙指縮放。':'可使用 WASD 移動的 3D 健身房');
    if(document.body.classList.contains('has-mobile-controls')){
      for(const element of app.querySelectorAll('.mission-description,.modal-description,.teaching-note,.interaction-prompt small')){
        const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode()))node.nodeValue=node.nodeValue.replaceAll('按 Esc','按「返回探索」').replaceAll('按 E','按右下角「使用」');
      }
      const key=app.querySelector('.interaction-prompt kbd');if(key)key.textContent='點';
      const help=app.querySelector('.help-grid');if(state.modal==='help'&&help&&!app.querySelector('.mobile-help'))help.insertAdjacentHTML('beforebegin','<p class="mobile-help">左下搖桿移動；同時按住右下「奔跑」加速。拖曳場景轉動視角，雙指張合縮放。靠近器材按「使用／選動作」，離開時按「返回探索」。</p>');
    }
    apply();
  }
  app.addEventListener('click',event=>{
    if(event.target.closest('[data-mobile-menu-toggle]')){event.preventDefault();menuOpen=!menuOpen;apply();onChange();return;}
    if(event.target.closest('[data-mobile-panel-toggle]')){event.preventDefault();collapsed=!collapsed;apply();onChange();return;}
    if(event.target.closest('.header-actions [data-action]'))closeMenu();
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuOpen){event.preventDefault();event.stopImmediatePropagation();closeMenu();}},true);
  window.addEventListener('resize',()=>{if(!compact())closeMenu();apply();onChange();});
  return{decorate,closeMenu,get menuOpen(){return menuOpen;},get collapsed(){return collapsed;}};
}
