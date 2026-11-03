import './styles.css';
import './upgrade.css';
import { createWorld } from './world.js';
import { stations, trainingGoals, facilitySources, equipmentCategories } from './data.js';
import { icon } from './icons.js';
import { muscleMap } from './muscle-map.js';
import { mapMarkup, updateMaps } from './minimap.js';

const app = document.querySelector('#app');
const byId = id => stations.find(s => s.id === id);
const readSaved = () => { try { const value = JSON.parse(localStorage.getItem('form.learned') || '[]'); return Array.isArray(value) ? value.filter(id => byId(id)) : []; } catch { return []; } };
const state = {
  welcome: true, loaded: false, error: null, selectedGoal: 'fullbody', mode: 'guided',
  goal: null, targetId: null, nearby: null, active: null, modal: null,
  completed: new Set(readSaved()), sessionCompleted: new Set(), zone: '接待大廳',
  paused: false, speed: 1, toast: '', reps: 0, activeTab: 'muscles',
  catalogCategory: 'all', catalogQuery: '', plateLoad: 10,
};
let world;
let toastTimer;
let lastFrame = performance.now();
let lastMapUpdate = 0;
const escapeHTML = value => String(value).replace(/[&<>"']/g, character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function save() { try { localStorage.setItem('form.learned', JSON.stringify([...state.completed])); } catch { /* Exploration still works when storage is unavailable. */ } }
function goal() { return trainingGoals.find(g => g.id === state.selectedGoal) || trainingGoals[0]; }
function notify(message) {
  state.toast = message;
  clearTimeout(toastTimer);
  render();
  toastTimer = setTimeout(() => { state.toast = ''; render(); }, 4000);
}
function syncControls() { world?.setEnabled(state.loaded && !state.welcome && !state.active && !state.modal); }

function header() {
  return `<header class="topbar">
    <a class="brand" href="#" data-action="home" aria-label="FORM 首頁"><span class="brand-mark"><i></i><i></i><i></i></span><span>FORM<span class="brand-dot">.</span></span><small>GYM EXPLORER</small></a>
    <div class="header-center"><span class="live-dot"></span><span id="zone-name">${state.zone}</span><span class="header-divider"></span><span>YOUR SPACE TO START</span></div>
    <nav class="header-actions" aria-label="主要功能">
      <button class="icon-button" data-action="help" aria-label="操作說明">${icon('info')}</button>
      <button class="quiet-button" data-action="choose">${icon('route')}<span>今日探索</span></button>
      <button class="quiet-button" data-action="catalog">${icon('book')}<span>器材圖鑑</span></button>
      <button class="quiet-button map-button" data-action="map">${icon('map')}<span>場館地圖</span></button>
    </nav>
  </header>`;
}

function welcome() {
  const selected = goal();
  return `<div class="welcome-shade"></div><main class="welcome-wrap" aria-label="選擇今日探索模式">
    <section class="welcome-card">
      <div class="eyebrow"><span class="tiny-line"></span> A LITTLE KNOWLEDGE. A STRONGER START.</div>
      <h1>今天，想練哪裡<span>？</span></h1>
      <p class="welcome-description">先在這裡熟悉器材。讓第一次走進健身房，<br class="desktop-break">也能知道下一步該怎麼做。</p>
      <div class="section-heading"><span>選一個今天想認識的部位</span><small>01 — CHOOSE YOUR FOCUS</small></div>
      <div class="goal-grid" role="group" aria-label="訓練部位">
        ${trainingGoals.map(g => `<button class="goal-card ${g.id === selected.id ? 'selected' : ''}" data-goal="${g.id}" aria-pressed="${g.id === selected.id}"><span class="goal-icon">${icon(g.icon)}</span><strong>${g.name}</strong><small>${g.english}</small><span class="goal-check">${g.id === selected.id ? icon('check') : ''}</span></button>`).join('')}
      </div>
      <div class="route-preview"><div class="route-preview-heading">${icon('route')}<strong>為你安排的探索路線</strong><span>${selected.stationIds.length} 個動作</span></div><p>${selected.description}</p><div class="preview-stations">${selected.stationIds.map((id, index) => `<span><b>${String(index+1).padStart(2,'0')}</b>${byId(id)?.name || ''}</span>`).join('<i>→</i>')}</div></div>
      <button class="primary-button start-button" data-action="start" ${!state.loaded ? 'disabled' : ''}><span>${state.error ? '3D 場景載入失敗' : state.loaded ? '開始今日探索' : '正在準備你的健身房…'}</span>${icon('arrow')}</button>
      <button class="free-button" data-action="free" ${!state.loaded ? 'disabled' : ''}>${icon('compass')} 我想先自由逛逛 <span>不設定路線，隨時認識器材 ${icon('arrow')}</span></button>
      <div class="welcome-footnote"><span class="status-dot"></span>單人探索<span>・</span>無需帳號<span>・</span>學習進度自動保留</div>
      ${state.error ? `<p class="error-message">${state.error}。請使用支援 WebGL 的電腦瀏覽器，並開啟硬體加速後重新整理。</p>` : ''}
    </section>
    <aside class="welcome-aside"><div class="floating-tag"><span class="live-dot"></span>YOUR FIRST GYM, REIMAGINED.</div><h2>每一次開始，<br>都值得更有把握。</h2><div class="aside-divider"></div><p>走進去。試著了解。<br>找到適合自己的節奏。</p><div class="aside-bottom"><span>探索空間</span><span>認識肌群</span><span>看懂動作</span></div></aside>
  </main><div class="welcome-bottom"><span>MOVE WITH CONFIDENCE.</span><button data-action="sources">場館與教學資料 ${icon('arrow')}</button></div>`;
}

function mission() {
  const g = state.goal;
  const done = g ? g.stationIds.filter(id => state.sessionCompleted.has(id)).length : 0;
  return `<aside class="mission-panel glass-panel">
    <div class="panel-overline">${state.mode === 'guided' ? 'TODAY’S EXPLORATION' : 'OPEN EXPLORATION'}<span class="panel-badge">${state.mode === 'guided' ? '引導模式' : '自由模式'}</span></div>
    <h2>${state.mode === 'guided' ? `${g.name}探索日` : '跟著好奇心走走'}</h2>
    <p class="mission-description">${state.mode === 'guided' ? '找到器材，讓每個動作都更清楚。' : '靠近任何器材，按 E 打開動作教學。'}</p>
    ${g && state.mode === 'guided' ? `<div class="mission-progress"><span style="width:${done/g.stationIds.length*100}%"></span></div><div class="progress-caption"><span>${done === g.stationIds.length ? '今天的探索已完成 ✓' : '今日探索進度'}</span><b>${done} / ${g.stationIds.length}</b></div><ol class="mission-list">${g.stationIds.map((id,index) => { const s = byId(id), done = state.sessionCompleted.has(id); return `<li><button data-target="${id}" class="mission-item ${state.targetId === id ? 'target' : ''} ${done ? 'done' : ''}"><span class="mission-number">${done ? icon('check') : String(index+1).padStart(2,'0')}</span><span><strong>${s.name}</strong><small>${s.zone}</small></span>${state.targetId === id ? icon('pin') : icon('arrow')}</button></li>`; }).join('')}</ol>` : `<div class="free-stat"><strong>${state.completed.size}<small>/ ${stations.length}</small></strong><span>已認識的器材</span></div><button class="secondary-button full-width" data-action="map">${icon('map')}看看器材在哪裡</button>`}
    ${g?.alternatives?.length ? `<div class="alternative-routes"><small>同部位，還可以認識</small>${g.alternatives.slice(0,3).map(id=>`<button data-target="${id}">${byId(id).name}${icon('arrow')}</button>`).join('')}</div>` : ''}
    <button class="text-button switch-mode" data-action="${state.mode === 'guided' ? 'switch-free' : 'choose'}">${state.mode === 'guided' ? '切換為自由探索' : '選擇今天的探索部位'} ${icon('arrow')}</button>
  </aside>`;
}

function stationPanel() {
  const s = state.active;
  if (!s) return '';
  return `<aside class="station-panel" aria-label="${s.name}教學">
    <div class="station-top"><span class="eyebrow">KNOW YOUR MOVEMENT</span><button class="icon-button dark" data-action="close-station" aria-label="關閉器材教學">${icon('close')}</button></div>
    <div class="station-title"><span class="station-index">${s.number}</span><div><small>${s.english}</small><h2>${s.name}</h2></div></div>
    <div class="station-zone">${icon('pin')} ${s.zone}<span class="${s.plateLoaded ? 'plate-tag' : ''}">${s.equipmentTag || '入門認識'}</span></div>
    <div class="station-scroll"><div class="teaching-tabs" role="tablist" aria-label="教學內容">${[['muscles','練哪裡'],['technique','怎麼練'],['range','動作行程']].map(([id,label])=>`<button class="${state.activeTab===id ? 'active' : ''}" data-tab="${id}" role="tab" aria-selected="${state.activeTab===id}">${label}</button>`).join('')}</div>
    <div class="teaching-content" data-content="muscles"><div class="muscle-visual">${muscleMap(s.muscleKeys,s.secondaryMuscleKeys)}<div class="muscle-legend"><span><i class="primary-swatch"></i>主要肌群</span><span><i class="secondary-swatch"></i>輔助肌群</span></div>${s.muscleKeys.length ? '' : '<small class="cardio-note">有氧訓練以心肺與連續活動為主，不標示單一主要肌群</small>'}</div><div class="muscle-label"><small>主要訓練</small><strong>${s.primary.join('、')}</strong></div><div class="muscle-label secondary"><small>輔助參與</small><span>${s.secondary.join('、') || '依姿勢與使用方式而異'}</span></div><p class="activation-note">標色表示參與部位，不代表量測的出力強度。</p></div>
    <div class="teaching-content hidden" data-content="technique"><ol class="teaching-steps">${s.steps.map((step,index)=>`<li><span>${String(index+1).padStart(2,'0')}</span><div><h3>${step.title}</h3><p>${step.text}</p></div></li>`).join('')}</ol><div class="coach-tip"><strong>留意這些小地方</strong><ul>${s.mistakes.map(m=>`<li>${m}</li>`).join('')}</ul></div></div>
    <div class="teaching-content hidden" data-content="range"><div class="range-stops"><div><b>A</b><small>起始位置</small><p>${s.range.start}</p></div><span>↓</span><div><b>B</b><small>結束位置</small><p>${s.range.end}</p></div></div><div class="coach-tip"><strong>讓動作保持可控制</strong><p>${s.range.cue}</p></div><p class="range-note">可控制且無痛的活動範圍因人與機型而異，動畫顯示的是簡化路徑。</p></div>
    <div class="animation-control"><div class="animation-heading"><span><i class="live-dot"></i><strong>3D 動作示範</strong></span><span id="pose-label">準備動作</span></div><progress id="pose-progress" max="1" value="0" aria-label="示範動作進度"></progress><div class="animation-buttons"><button data-action="pause" class="play-control" aria-label="${state.paused ? '播放示範' : '暫停示範'}">${icon(state.paused ? 'play' : 'pause')}<span>${state.paused ? '播放' : '暫停'}</span></button><div class="speed-controls" aria-label="動畫速度">${[0.5,1].map(speed=>`<button data-speed="${speed}" class="${state.speed === speed ? 'active' : ''}" aria-pressed="${state.speed === speed}">${speed === .5 ? '0.5× 慢速' : '1× 正常'}</button>`).join('')}</div></div></div>
    ${s.plateLoaded ? `<section class="plate-load-control" aria-label="槓片外觀設定"><div><strong>每側裝片</strong><span id="plate-load-label">${state.plateLoad} kg／側</span></div><div class="plate-load-options">${[5,10,20].map(kg=>`<button data-plate-load="${kg}" aria-pressed="${state.plateLoad===kg}" class="${state.plateLoad===kg ? 'active' : ''}">${kg}<small> kg</small></button>`).join('')}</div><p>觀察左右對稱裝片與機械連動，重量為外觀示範。</p></section>` : ''}
    </div><div class="station-footer"><button class="primary-button full-width" data-action="learned">${icon('check')}已了解這個動作${icon('arrow')}</button>
    <p class="teaching-note">初次使用實際器材，請教練協助確認調整方式。<a href="${s.source.url}" target="_blank" rel="noopener noreferrer">教學參考 ↗</a></p></div>
  </aside>`;
}

function hud() {
  const near = state.nearby;
  const target = byId(state.targetId);
  return `<main class="explore-ui" aria-label="健身房探索">
    ${!state.active ? mission() : ''}
    ${!state.active && target ? `<div class="navigation-pill"><span class="navigation-icon">${icon('pin')}</span><span>正在前往<strong>${target.name}</strong></span><b id="target-distance">— m</b></div>` : ''}
    ${state.active ? `<div class="demo-badge glass-panel"><span class="live-dot"></span><div><strong>先看懂，再開始</strong><small>按住空白處拖曳，從不同角度觀察動作</small><div class="muscle-legend"><span><i class="primary-swatch"></i>主要肌群</span><span><i class="secondary-swatch"></i>輔助肌群</span></div></div></div>` : ''}
    ${stationPanel()}
    ${!state.active ? `<button class="minimap-card glass-panel" data-action="map" aria-label="開啟完整場館地圖"><div class="minimap-heading"><span>${icon('map')}場館導覽</span><small>點擊展開 ↗</small></div>${mapMarkup(stations,state.targetId,state.completed)}<div class="minimap-legend"><span><i></i>你的位置</span><span><i></i>探索目標</span></div></button>` : ''}
    ${!state.active && near ? `<button class="interaction-prompt" data-action="interact"><kbd>E</kbd><span><small>認識這台器材</small><strong>${near.name}</strong></span>${icon('arrow')}</button>` : ''}
    <div class="controls-bar"><span><kbd>W</kbd><span class="stacked-keys"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>移動</span><i></i><span><span class="mouse-icon"></span>拖曳轉動視角</span><i></i><span>滾輪縮放</span><i></i><span><kbd>${state.active ? 'Esc' : 'E'}</kbd>${state.active ? '離開教學' : '器材互動'}</span><button data-action="help" aria-label="更多操作說明">${icon('info')}</button></div>
    <div class="explore-caption">A SPACE TO LEARN. A PLACE TO BEGIN.</div>
  </main>`;
}

function catalogItems() {
  const query = state.catalogQuery.trim().toLocaleLowerCase();
  const matches = stations.filter(s => (state.catalogCategory==='all'||s.category===state.catalogCategory) && (!query||`${s.name} ${s.english} ${s.primary.join(' ')} ${s.equipmentTag}`.toLocaleLowerCase().includes(query)));
  return `<div class="catalog-result-caption"><span>${matches.length} 種器材</span><span>選一台，前往場內認識</span></div>${matches.length ? `<div class="catalog-grid">${matches.map(s=>`<button class="catalog-item" data-catalog-target="${s.id}"><span class="catalog-item-top"><b>${s.number}</b><span class="catalog-type ${s.plateLoaded ? 'plate-tag' : ''}">${s.equipmentTag}</span></span><strong>${s.name}</strong><small>${s.english}</small><p>${s.primary.join('・')}</p><span class="catalog-item-bottom">${s.zone}<span>${icon('pin')}導航前往</span></span></button>`).join('')}</div>` : '<div class="catalog-empty">沒有符合的器材，試試其他名稱或肌群。</div>'}`;
}

function modal() {
  if (!state.modal) return '';
  let content;
  if (state.modal === 'map') content = `<div class="modal-heading"><div><span class="eyebrow">FIND YOUR WAY</span><h2>每一區，都有新的發現。</h2></div><button class="icon-button dark" data-action="close-modal" aria-label="關閉地圖">${icon('close')}</button></div><p class="modal-description">點選器材編號，設定你的下一個探索目標。</p><div class="large-map-wrap">${mapMarkup(stations,state.targetId,state.completed,true)}</div><div class="map-footnote"><span><i class="live-dot"></i>你的位置會隨移動更新</span><span>依連鎖健身房常見設施設計的虛構場館</span></div>`;
  else if (state.modal === 'catalog') content = `<div class="modal-heading"><div><span class="eyebrow">A MOVEMENT FOR EVERY MUSCLE</span><h2>找到你想認識的器材。</h2></div><button class="icon-button dark" data-action="close-modal" aria-label="關閉器材圖鑑">${icon('close')}</button></div><p class="modal-description">${stations.length} 種器材，從插銷、槓片到自由重量。每一台都有肌群標示與動作教學。</p><div class="catalog-toolbar"><div class="catalog-filters" role="group" aria-label="器材種類">${equipmentCategories.map(category=>`<button data-catalog-category="${category.id}" class="${state.catalogCategory===category.id ? 'active' : ''}" aria-pressed="${state.catalogCategory===category.id}">${category.name}</button>`).join('')}</div><input type="search" id="catalog-search" placeholder="搜尋器材或肌群…" aria-label="搜尋器材或肌群" value="${escapeHTML(state.catalogQuery)}" autocomplete="off"></div><div id="catalog-results">${catalogItems()}</div>`;
  else if (state.modal === 'sources') content = `<div class="modal-heading"><div><span class="eyebrow">BUILT WITH REFERENCES</span><h2>場館與教學資料</h2></div><button class="icon-button dark" data-action="close-modal" aria-label="關閉資料來源">${icon('close')}</button></div><p class="modal-description">以台灣連鎖健身房的公開設施資料為參考，自行設計空間與器材模型。</p><div class="source-list">${facilitySources.map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer"><strong>${s.label} ↗</strong><p>${s.note}</p></a>`).join('')}<div><strong>動作教學參考</strong><p>各器材教學附上 NASM、ACE、Mayo Clinic 等來源連結。人物以人體比例與接觸點製作程序化動畫，仍需要專業教練審核後，才能作為正式的動作教材。</p></div></div>`;
  else content = `<div class="modal-heading"><div><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2>慢慢逛，隨時都能停下來。</h2></div><button class="icon-button dark" data-action="close-modal" aria-label="關閉操作說明">${icon('close')}</button></div><div class="help-grid"><div><kbd>W A S D</kbd><strong>或方向鍵移動</strong><p>Shift 可以快走，靠近器材會出現互動提示。</p></div><div><span class="help-mouse">${icon('compass')}</span><strong>拖曳空白處轉動視角</strong><p>使用滑鼠滾輪調整觀看距離。</p></div><div><kbd>E</kbd><strong>查看器材教學</strong><p>認識主要肌群、操作步驟與動作行程。</p></div><div><kbd>Esc</kbd><strong>離開教學或地圖</strong><p>按 M 開啟地圖；右上方可重新選擇探索部位。</p></div></div><p class="help-note">「已了解」記錄的是遊戲中的學習進度，不代表已完成實際訓練。進度儲存在此瀏覽器。</p><div class="help-footer"><button class="text-button" data-action="sources">查看場館與教學資料 ${icon('arrow')}</button><button class="text-button subtle" data-action="reset">重設學習進度</button></div>`;
  return `<div class="modal-overlay" data-backdrop><section class="modal-card ${state.modal === 'map' ? 'map-modal' : state.modal === 'catalog' ? 'catalog-modal' : ''}" role="dialog" aria-modal="true" aria-label="${state.modal === 'map' ? '場館地圖' : state.modal === 'catalog' ? '器材圖鑑' : state.modal === 'sources' ? '資料來源' : '操作說明'}">${content}</section></div>`;
}

function render() {
  app.innerHTML = `${header()}${state.welcome ? welcome() : hud()}${modal()}${state.toast ? `<div class="toast" role="status">${icon('check')}${state.toast}</div>` : ''}`;
  document.querySelectorAll('[data-content]').forEach(c=>c.classList.toggle('hidden',c.dataset.content!==state.activeTab));
  document.body.classList.toggle('is-welcome', state.welcome);
  document.body.classList.toggle('is-teaching', !!state.active);
  syncControls();
}

function setTarget(id) {
  state.targetId = id;
  world?.setTarget(id);
}
function start(mode) {
  if (!state.loaded) return;
  state.welcome = false;
  state.mode = mode;
  state.goal = mode === 'guided' ? goal() : null;
  state.sessionCompleted = new Set();
  setTarget(state.goal?.stationIds[0] || null);
  render();
}
function closeStation() {
  if (!state.active) return;
  world?.stopExercise();
  state.active = null;
  state.paused = false;
  render();
}
function openStation(station) {
  if (!station || !state.loaded || state.welcome || state.modal) return;
  state.active = station;
  state.paused = false;
  state.reps = 0;
  state.activeTab = 'muscles';
  state.speed = 1;
  world.startExercise(station.id);
  state.plateLoad = world.getPlateLoad?.(station.id) ?? 10;
  world.setAnimationSpeed(1);
  world.setAnimationPaused(false);
  render();
}
function openModal(name) {
  if (state.active) closeStation();
  state.modal = name;
  render();
}

app.addEventListener('click', event => {
  const button = event.target.closest('[data-action], [data-goal], [data-target], [data-map-station], [data-speed], [data-tab], [data-catalog-category], [data-catalog-target], [data-plate-load], [data-backdrop]');
  if (!button) return;
  const {action,goal:goalId,target,mapStation,speed,tab,catalogCategory,catalogTarget,plateLoad} = button.dataset;
  if (goalId) { state.selectedGoal = goalId; render(); return; }
  if (target || mapStation || catalogTarget) {
    if(state.welcome){state.welcome=false;state.mode='free';state.goal=null;}
    setTarget(target || mapStation || catalogTarget); state.modal = null; render(); return;
  }
  if(catalogCategory){state.catalogCategory=catalogCategory;render();return;}
  if(plateLoad && state.active){
    world.setPlateLoad?.(state.active.id,Number(plateLoad));state.plateLoad=world.getPlateLoad?.(state.active.id)??Number(plateLoad);
    document.querySelectorAll('[data-plate-load]').forEach(option=>{const selected=Number(option.dataset.plateLoad)===state.plateLoad;option.classList.toggle('active',selected);option.setAttribute('aria-pressed',String(selected));});
    const label=document.querySelector('#plate-load-label');if(label)label.textContent=`${state.plateLoad} kg／側`;
    return;
  }
  if (speed) { state.speed = Number(speed); world?.setAnimationSpeed(state.speed); document.querySelectorAll('[data-speed]').forEach(b=>{ b.classList.toggle('active',b===button); b.setAttribute('aria-pressed', String(b===button)); }); return; }
  if (tab) {
    state.activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',String(b===button));});
    document.querySelectorAll('[data-content]').forEach(c=>c.classList.toggle('hidden',c.dataset.content!==tab));
    return;
  }
  if (button.hasAttribute('data-backdrop')) { if (event.target === button) { state.modal = null; render(); } return; }
  switch(action) {
    case 'home': event.preventDefault();
    case 'choose': if (state.active) closeStation(); state.modal = null; state.welcome = true; render(); break;
    case 'start': start('guided'); break;
    case 'free': start('free'); break;
    case 'switch-free': state.mode='free';state.goal=null;setTarget(null);render();break;
    case 'map': openModal('map'); break;
    case 'catalog': openModal('catalog'); break;
    case 'help': openModal('help'); break;
    case 'sources': openModal('sources'); break;
    case 'close-modal': state.modal = null;render();break;
    case 'interact': openStation(state.nearby);break;
    case 'close-station': closeStation();break;
    case 'pause': state.paused = !state.paused;world?.setAnimationPaused(state.paused);button.innerHTML=`${icon(state.paused ? 'play' : 'pause')}<span>${state.paused ? '播放' : '暫停'}</span>`;button.setAttribute('aria-label',state.paused ? '播放示範' : '暫停示範');break;
    case 'learned': {
      const s=state.active;
      state.completed.add(s.id);state.sessionCompleted.add(s.id);save();closeStation();
      const next = state.goal?.stationIds.find(id=>!state.sessionCompleted.has(id));
      if(state.mode==='guided') setTarget(next || null);
      notify(next ? `已認識${s.name}，繼續下一站！` : state.goal ? '今天的動作探索完成了！也可以繼續自由逛逛。' : `已認識${s.name}`);
      break;
    }
    case 'reset': state.completed.clear();state.sessionCompleted.clear();save();state.modal=null;notify('學習進度已重設');break;
  }
});

app.addEventListener('input',event=>{
  if(event.target.id!=='catalog-search')return;
  state.catalogQuery=event.target.value;
  const results=document.querySelector('#catalog-results');if(results)results.innerHTML=catalogItems();
});

window.addEventListener('keydown',event=>{
  if (event.key === 'Escape') {
    event.preventDefault();
    if (state.modal) {state.modal=null;render();}
    else if (state.active) closeStation();
    else if (state.welcome && state.loaded && state.goal) {state.welcome=false;render();}
    return;
  }
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase()==='e' && !state.welcome && !state.modal && !state.active) {event.preventDefault();openStation(state.nearby);}
  if(event.key.toLowerCase()==='m' && !state.welcome && !state.active) {event.preventDefault();if(state.modal==='map'){state.modal=null;render();}else openModal('map');}
});
app.addEventListener('keydown',event=>{
  const target=event.target.closest('[data-map-station]');
  if(target && (event.key==='Enter' || event.key===' ')){event.preventDefault();target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
});

render();
try {
  world = await createWorld({
    canvas:document.querySelector('#gym-canvas'),stations,
    onNearbyChange(station) { if ((station?.id||null)!==(state.nearby?.id||null)) {state.nearby=station;if(!state.welcome&&!state.active&&!state.modal)render();} },
    onZoneChange(zone) {state.zone=zone;const label=document.querySelector('#zone-name');if(label)label.textContent=zone;},
    onPoseProgress({phase,reps,label}) {state.reps=reps;const progress=document.querySelector('#pose-progress');if(progress)progress.value=phase;const pose=document.querySelector('#pose-label');if(pose)pose.textContent=label;},
  });
  state.loaded=true;
  render();
  if(import.meta.env.DEV) window.__FORM__={world,state,stations,openStation,setTarget};
  function frame(now) {
    const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
    world.update(dt);
    if(now-lastMapUpdate>70){
      const position=world.getPlayerPosition(),target=byId(state.targetId);
      updateMaps(position,world.getHeading(),target);
      const distance=document.querySelector('#target-distance');if(distance&&target)distance.textContent=`${Math.round(Math.hypot(position.x-target.position.x,position.z-target.position.z))} m`;
      lastMapUpdate=now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize',()=>world.resize());
} catch(error) {
  console.error(error);
  state.error='目前無法啟用 3D 場景';state.loaded=false;render();
}
