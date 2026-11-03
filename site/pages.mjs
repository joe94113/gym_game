import {catalogActivities} from '../src/activity-catalog.js';
import {teachingReferenceMarkup,teachingReferenceSummary} from '../src/teaching-references-v020.js';
import {SITE_NAME,SITE_TITLE,SITE_DESCRIPTION,escapeHTML as esc,sitePath,siteURL,metadata,iconLinks} from './config.mjs';

export const guideGroups=[
  {slug:'dumbbells',name:'啞鈴與自由重量',intro:'同一對啞鈴，可以做出不同動作。先看站位、握法與身體支撐，再切到 3D 示範觀察拿起與放回。',matches:e=>e.id.startsWith('dumbbell-')},
  {slug:'cables',name:'龍門架與滑輪握把',intro:'滑輪高度、拉力方向與握把都會影響動作。這裡列出遊戲中已配置的相容組合，可在示範裡觀察纜線與手部接點。',matches:e=>e.stationId==='cable-fly'},
  {slug:'machines',name:'固定、槓片與槓鈴器材',intro:'從胸推、背部划船到腿推，逐台認識座位、支撐與運動行程。遊戲提供已校正範圍的器材設定，實際機台仍要依現場規格調整。',matches:e=>e.runtime==='machine'&&e.category!=='cardio'&&e.stationId!=='cable-fly'},
  {slug:'cardio',name:'有氧器材',intro:'跑步機、健身車、橢圓機、划船測功儀與階梯機有不同的上下機方式和動作順序。可先在遊戲裡看操作，再認識現場機台。',matches:e=>e.category==='cardio'},
  {slug:'stretching',name:'草皮伸展與活動度',intro:'伸展標色表示目標部位，並非量到的出力。慢慢觀察起始姿勢、支撐和活動範圍，不需要硬把動作做到最深。',matches:e=>['stretch','mobility'].includes(e.category)&&!e.classKind},
  {slug:'classes',name:'七種團體課程',intro:'全身活動、有氧舞蹈、飛輪、TRX、槓鈴肌力、空中瑜珈與皮拉提斯，各有暖身、主訓與緩和；可跟著整堂播放，也能跳段預覽。',matches:e=>!!e.classKind},
];

export function groupedActivities(){
  const seen=new Set();
  return guideGroups.map(group=>({...group,items:catalogActivities.filter(e=>group.matches(e)&&!seen.has(e.id)).map(e=>{seen.add(e.id);return e;})}));
}

const nav=site=>`<header class="site-header"><a class="site-brand" href="${sitePath(site)}"><img src="${sitePath(site,'brand-mark.svg')}" width="40" height="40" alt="">${SITE_NAME}</a><nav aria-label="網站導覽"><a href="${sitePath(site,'guide/')}">器材與動作指南</a><a href="${sitePath(site,'about/')}">認識肌動基地</a><a class="button small" href="${sitePath(site)}">進入健身房</a></nav></header>`;
const footer=site=>`<footer><p>肌動基地 · MUSCLE BASE</p><p>教學採公開教學與原廠說明對照，可展開每個動作查看來源與涵蓋範圍。肌群標色不是出力量測；目前沒有真人專業簽核。</p><a href="${sitePath(site,'about/')}#data">資料保存與使用範圍</a></footer>`;
function document(site,{title,description,path,body,schema,noindex=false}){
  return`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#172a27">${metadata(noindex?{...site,indexable:false}:site,{title,description,path,schema})}${iconLinks(site)}<link rel="stylesheet" href="${sitePath(site,'guide.css')}"></head><body><a class="skip-link" href="#content">跳到主要內容</a>${nav(site)}<main id="content">${body}</main>${footer(site)}</body></html>`;
}
const crumbs=(site,name)=>`<nav class="breadcrumbs" aria-label="目前位置"><a href="${sitePath(site)}">肌動基地</a> / <a href="${sitePath(site,'guide/')}">動作指南</a>${name?' / '+esc(name):''}</nav>`;

function exerciseCard(site,item){
  const stretch=['stretch','mobility'].includes(item.category),primaryLabel=item.classKind?'課程參與部位':stretch?'活動與伸展目標':item.category==='cardio'?'訓練重點':'主要肌群';
  const stage=item.courseBlocks?`<p class="tag">全程 ${item.duration/60} 分鐘 · 暖身、主要訓練、緩和</p><p>${esc(item.summary)}</p>`:'';
  return`<article class="exercise" id="${esc(item.id)}"><div class="exercise-heading"><h2>${esc(item.name)}</h2><a class="button" href="${sitePath(site)}?exercise=${encodeURIComponent(item.id)}">在 3D 裡看動作</a></div>${stage}<p class="muscles"><strong>${primaryLabel}：</strong>${esc((item.primary||[]).join('、'))}${item.secondary?.length?`<br><strong>輔助與支撐：</strong>${esc(item.secondary.join('、'))}`:''}</p><ol>${(item.steps||[]).map(step=>`<li><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join('')}</ol>${item.range?`<div class="range"><h3>行程與控制</h3><p>${esc(item.range.start)} → ${esc(item.range.end)}</p><p>${esc(item.range.cue)}</p></div>`:''}${item.mistakes?.length?`<details><summary>常見需要留意的地方</summary><ul>${item.mistakes.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></details>`:''}${item.source?.url?`<p class="reference">教學參考：<a href="${esc(item.source.url)}" target="_blank" rel="noopener noreferrer">${esc(item.source.label)} ↗</a></p>`:''}${teachingReferenceMarkup(item)}</article>`;
}

export function publicPages(site,{accountMode='server'}={}){
  const pages=new Map(),groups=groupedActivities(),teaching=teachingReferenceSummary(catalogActivities);
  pages.set('guide/index.html',document(site,{title:'健身房器材與動作指南｜肌動基地',description:'認識啞鈴、龍門架、固定與槓片器材、有氧、伸展及七種團課。文字指南搭配 3D 示範，查看肌群、握法與運動行程。',path:'guide/',body:`${crumbs(site)}<section class="hero"><p class="eyebrow">先認識，再走進去試試</p><h1>健身房器材與動作指南</h1><p>想知道這台練哪裡、手要握哪裡？先選一區，看完文字後可以直接開啟相同動作的 3D 示範。文字頁不用下載人物模型，也能閱讀。</p></section><div class="guide-grid">${groups.map(group=>`<a class="guide-card" href="${sitePath(site,`guide/${group.slug}/`)}"><span>${group.items.length} 個動作</span><h2>${group.name}</h2><p>${group.intro}</p><strong>查看動作 →</strong></a>`).join('')}</div><section class="note"><h2>教學依據怎麼看？</h2><p>這裡採公開教學與原廠說明對照。每個動作都能展開查看來源、核對範圍與待補內容；同類器材教學、局部操作、相關變式、器材規格和課程形式資料會分開標示。</p><p>來源核對與動畫檢查分開記錄，目前沒有真人專業簽核。</p></section><section class="note"><h2>紅橘色怎麼看？</h2><p>紅色是主要肌群，橘色是輔助或支撐參與。伸展改標示目標部位，團課則會隨當前段落更新；顏色不是實際量到的出力強度。</p></section>`}));
  for(const group of groups){
    const path=`guide/${group.slug}/`,url=siteURL(site,path),schema=url?{'@context':'https://schema.org','@type':'CollectionPage',name:group.name,description:group.intro,url,inLanguage:'zh-Hant-TW',breadcrumb:{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:SITE_NAME,item:site.url},{'@type':'ListItem',position:2,name:'器材與動作指南',item:siteURL(site,'guide/')},{'@type':'ListItem',position:3,name:group.name,item:url}]}}:undefined;
    pages.set(`${path}index.html`,document(site,{title:`${group.name}：動作、肌群與使用方式｜肌動基地`,description:group.intro,path,schema,body:`${crumbs(site,group.name)}<section class="hero"><p class="eyebrow">器材與動作指南</p><h1>${group.name}</h1><p>${group.intro}</p></section><nav class="contents" aria-label="本頁動作">${group.items.map(e=>`<a href="#${esc(e.id)}">${esc(e.name)}</a>`).join('')}</nav>${group.items.map(e=>exerciseCard(site,e)).join('')}<p class="note">每個動作的「公開教學對照」會列出來源類型、已核對的部分與未涵蓋內容。文字與遊戲共用同一份資料；訓練安排仍需依自身狀況調整。<a href="${sitePath(site,'guide/')}">回到其他區域 →</a></p>`}));
  }
  pages.set('about/index.html',document(site,{title:'認識肌動基地｜瀏覽器裡的 3D 健身房',description:SITE_DESCRIPTION,path:'about/',body:`<section class="hero"><p class="eyebrow">MUSCLE BASE</p><h1>3D 健身房，走進去就能學。</h1><p>肌動基地是一款支援電腦鍵盤與手機觸控的健身房探索遊戲。可以先選今天想練的部位，跟著推薦器材走，也可以自由逛逛，再靠近器材開始看示範。</p><a class="button" href="${sitePath(site)}">進入肌動基地 →</a></section><div class="guide-grid"><section class="note"><h2>看懂器材與肌群</h2><p>場內有 46 台器材；動作庫含 58 種器材與地面動作、七種團課。紅橘標色配合文字說明，可轉動視角、暫停與慢放觀察。</p><p>16 位名單教練各有實際 3D 人物，分布在櫃台、諮詢座位、訓練區與教室；姓名、頭像與造型均為虛構。</p><a href="${sitePath(site,'guide/')}">查看器材與動作指南 →</a></section><section class="note"><h2>安排今天的探索</h2><p>依部位、經驗與時間選擇參考動作，再導航到器材。啞鈴、草皮與龍門架可以切換動作，部分器材可調座位、握距、滑輪或配重。</p></section><section class="note"><h2>跟完一整堂課</h2><p>七種團課都有暖身、主要訓練與緩和，搭配音樂、中文口令和換段提醒。跳段會標示預覽，不算完整上課。</p><a href="${sitePath(site,'guide/classes/')}">看看團課內容 →</a></section></div><section class="note"><h2>怎麼操作？</h2><dl><dt>電腦走動與奔跑</dt><dd>WASD 或方向鍵移動，按住 Shift 奔跑。靠近器材按 E 使用，Esc 放回離開，M 開啟地圖。</dd><dt>手機走動與使用器材</dt><dd>左下搖桿移動，另一指按住右下「按住奔跑」。靠近器材後按「使用／選動作」，結束時按「返回探索」。</dd><dt>看清楚動作</dt><dd>電腦按住場景拖曳轉動、滾輪縮放；手機在場景單指拖曳、雙指縮放。示範可暫停、慢放，手機點「展開教學」查看內容。</dd><dt>手機功能與地圖</dt><dd>上方「功能選單」可開啟地圖、動作清單、訓練安排及日誌；地圖下方也有文字站點可選。</dd></dl><p>3D 遊戲需要支援 WebGL 的瀏覽器。手機會使用較低解析度預算，並預設關閉動態陰影；iPhone、Android 和 iPad 的真機流暢度、發熱與耗電仍待測試。</p></section><section id="data" class="note"><h2>訓練紀錄存在哪裡？</h2><p>${accountMode==='local'?'這個 GitHub Pages 版本把日誌、學習進度與訓練安排保存在目前瀏覽器，沒有帳號雲端同步。可匯出 JSON 備份，再到另一台裝置匯入；清除網站資料或更換瀏覽器前，請先備份。':'訪客資料保存在目前瀏覽器；自架伺服器另可提供帳號同步。可以匯出 JSON 備份與 CSV，實際能否跨裝置同步取決於網站部署方式。'}</p><p>觀看動畫和按「已了解」不會自動變成實際運動紀錄；日誌由你填寫。</p></section><section class="note"><h2>教學依據怎麼看？</h2><p>0.20 採公開教學與原廠說明對照。目前 ${teaching.total} 項活動中，${teaching.checked} 項留有公開來源核對紀錄。同類器材動作教學、局部操作、相關變式、器材規格與課程形式資料各自標示，展開動作卡可看核對範圍與待補內容。</p><p>來源核對、動畫檢查與真人專業審查分開記錄；找到來源不代表整段動作、手腳對位或器材機構都已通過檢查。現階段沒有真人專業簽核，未來有合作教練時可另外留下意見。</p><a href="${sitePath(site,'guide/')}">查看逐動作的公開教學對照 →</a></section><section class="note"><h2>目前做到哪裡？</h2><p>65 項運動與團課中，17 項使用真人量測參考：四項採部分關節或骨盆資料，13 項只採節奏；其餘 48 項仍是編排的循環動畫。另有 18 類活動的部分就位、拿放或起坐段落採量測節奏，姿勢、器材路徑與手腳對位仍由遊戲控制。這些屬局部資料改編，仍有編排動畫。真人專業審查尚未執行，日後有合作教練時可在現有工作台另留意見與簽核。</p><p>人物使用真人比例模型與蒙皮標色，並做過接點和碰撞取樣檢查；這些檢查不等於每個瞬間都不會穿模。團課音樂由程式合成，中文口令使用合成語音，尚非真人錄製課程。空中瑜珈的身體與布面採受約束的模擬；不同裝置的實際流暢度仍需測試。</p><p>場館為虛構配置，沒有與 World Gym、健身工廠或 YouCan 合作，也沒有使用其品牌模型。運動電視為原創動畫，並非體育頻道直播。</p></section>`}));
  pages.set('404.html',document(site,{title:'找不到這一頁｜肌動基地',description:'這個頁面不存在，可以回到肌動基地或器材與動作指南。',path:'404.html',noindex:true,body:`<section class="hero"><p class="eyebrow">404</p><h1>這一頁不在場館裡。</h1><p>連結可能已更動。可以回到健身房，或從動作指南找器材。</p><a class="button" href="${sitePath(site)}">回到健身房 →</a></section>`}));
  return pages;
}

export function discoveryFiles(site,pages){
  const result=new Map([['.nojekyll',''],['robots.txt',site.indexable?`User-agent: *\nAllow: /\n${site.url?`Sitemap: ${siteURL(site,'sitemap.xml')}\n`:''}`:'User-agent: *\nDisallow: /\n']]);
  if(site.indexable){const paths=['',...[...pages.keys()].filter(key=>key.endsWith('/index.html')).map(key=>key.replace(/index\.html$/,''))];result.set('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path=>`<url><loc>${esc(siteURL(site,path))}</loc></url>`).join('')}</urlset>\n`);}
  return result;
}

export function homeFallback(site){
  return`<main class="site-loading" style="max-width:660px;margin:8vh auto;padding:28px;color:#edf1e7;background:#172a27;border-radius:18px;font:16px/1.7 system-ui"><h1>肌動基地：3D 健身房探索</h1><p>認識器材、看懂肌群，選擇今天想練的部位，或先自由走走。</p><p>正在準備遊戲。你也可以先閱讀<a style="color:#c5ed8e" href="${sitePath(site,'guide/')}">器材與動作指南</a>。</p><noscript><p>3D 遊戲需要啟用 JavaScript。文字指南可以直接閱讀，不用下載 3D 模型。</p></noscript></main>`;
}
