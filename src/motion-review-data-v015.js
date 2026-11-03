export const REVIEW_SOURCE_VERSION='0.19.0';
export const REVIEW_FORMAT_VERSION=3;
export const REVIEW_DIRECTIONS=['enter','loop','exit'];
export const REVIEW_VIEWS=['front','side','back'];
export const REVIEW_STATUSES={pending:'尚待審查','needs-fix':'需要修正',acceptable:'填表人認為可接受',reviewed:'舊版：曾填寫複核'};
const phases=['就位與接近','入座／入架','拿起與握持','運動行程','放回與放手','離開'];
const directions={enter:'就位與拿取',loop:'運動行程',exit:'放回與離開'},views={front:'正面',side:'側面',back:'背面'};
const MAX_TEXT=16*1024*1024,MAX_IMAGE=1024*1024,MAX_RECORDS=500,MAX_EVIDENCE=100;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const failure=(path,message)=>{throw Error(`${path}：${message}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)failure(path,'必須是一般物件');return value;};
const text=(value,path,max,{required=false}={})=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))failure(path,`請填${required?'非空白、':''}${max} 字以內的文字`);return value;};
const unit=(value,path,{nullable=true}={})=>{if(nullable&&(value===undefined||value===null))return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)failure(path,'必須是 0～1 的有限數字');return value;};
const date=(value,path)=>{text(value,path,40,{required:true});if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)failure(path,'必須是有效 ISO 日期時間');return value;};
const sourceVersion=(value,path)=>{if(typeof value==='string'&&value.length<32&&(value==='legacy-v013-unversioned'||/^0\.(?:13|14|15|16|17|18|19)\.\d+$/.test(value)))return value;failure(path,'不支援的來源版本，請使用 0.13～0.19 版工作台匯出檔');};

export function validateReviewPNG(value,path='image'){
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||value.length>MAX_IMAGE||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))failure(path,'必須是 1 MB 以內的 PNG data URL');
  let bytes;try{bytes=Uint8Array.from(atob(value.slice(22)),c=>c.charCodeAt(0));}catch{failure(path,'PNG base64 無效');}
  const signature=[137,80,78,71,13,10,26,10];if(bytes.length<57||signature.some((v,i)=>bytes[i]!==v))failure(path,'PNG 檔頭無效');
  const read32=offset=>(bytes[offset]*16777216+bytes[offset+1]*65536+bytes[offset+2]*256+bytes[offset+3]);
  let offset=8,hasHeader=false,hasData=false,hasEnd=false;
  while(offset+12<=bytes.length){const length=read32(offset),type=String.fromCharCode(...bytes.slice(offset+4,offset+8)),end=offset+12+length;if(end>bytes.length)failure(path,'PNG 區塊長度無效');
    if(!hasHeader){if(type!=='IHDR'||length!==13)failure(path,'PNG 缺少 IHDR');const width=read32(offset+8),height=read32(offset+12);if(width<1||height<1||width>1024||height>1024)failure(path,'PNG 尺寸需介於 1～1024 px');hasHeader=true;}
    if(type==='IDAT'&&length)hasData=true;if(type==='IEND'){if(length||end!==bytes.length)failure(path,'PNG 結尾無效');hasEnd=true;break;}offset=end;
  }
  if(!hasData||!hasEnd)failure(path,'PNG 缺少影像資料或結尾');return value;
}

function contact(value,path){
  if(value===undefined||value===null)return null;
  const raw=JSON.stringify(value);if(raw.length>50000)failure(path,'接點資料過大');let count=0;
  function visit(item,depth){if(++count>5000||depth>10)failure(path,'接點資料結構過深');if(item===null||typeof item==='boolean'||typeof item==='string')return;if(typeof item==='number'){if(!Number.isFinite(item))failure(path,'接點包含非有限數字');return;}if(typeof item!=='object')failure(path,'接點含不支援資料');if(Array.isArray(item)){item.forEach(v=>visit(v,depth+1));return;}object(item,path);for(const [key,value]of Object.entries(item)){if(['__proto__','prototype','constructor'].includes(key))failure(path,'不允許的接點欄位');visit(value,depth+1);}}
  visit(value,0);return JSON.parse(raw);
}
function inspection(value,path){if(value===undefined||value===null)return null;object(value,path);if(!REVIEW_DIRECTIONS.includes(value.direction))failure(path+'.direction','段落無效');return{direction:value.direction,phase:unit(value.phase,path+'.phase',{nullable:false})};}
function record(value,index,ids,defaultVersion){
  const path=`records[${index}]`;object(value,path);if(!ids.has(value.id))failure(path+'.id','找不到這個動作');if(value.professionalSignoff!==false)failure(path+'.professionalSignoff','此工具只保存意見，不能匯入專業認證');
  if(!Object.hasOwn(REVIEW_STATUSES,value.status))failure(path+'.status','結果無效');if(!phases.includes(value.stage))failure(path+'.stage','檢查段落無效');
  if(value.view!==undefined&&value.view!==null&&!REVIEW_VIEWS.includes(value.view))failure(path+'.view','方向無效');
  const version=sourceVersion(value.sourceVersion??defaultVersion,path+'.sourceVersion');
  return{id:value.id,stage:value.stage,status:value.status,reviewer:text(value.reviewer,path+'.reviewer',80,{required:true}),qualification:text(value.qualification??'',path+'.qualification',160),notes:text(value.notes,path+'.notes',2000,{required:true}),view:value.view??null,phase:unit(value.phase,path+'.phase'),lifecyclePhase:unit(value.lifecyclePhase,path+'.lifecyclePhase'),inspection:inspection(value.inspection,path+'.inspection'),image:validateReviewPNG(value.image,path+'.image'),createdAt:date(value.createdAt,path+'.createdAt'),contact:contact(value.contact,path+'.contact'),source:'manually-entered',sourceVersion:version,professionalSignoff:false};
}
function evidence(value,index,ids,defaultVersion){
  const path=`evidence[${index}]`;object(value,path);if(!ids.has(value.id))failure(path+'.id','找不到這個動作');if(!REVIEW_DIRECTIONS.includes(value.direction))failure(path+'.direction','段落無效');if(!REVIEW_VIEWS.includes(value.view))failure(path+'.view','方向無效');
  const image=validateReviewPNG(value.image,path+'.image');if(!image)failure(path+'.image','證據必須有實際 PNG');
  return{id:value.id,direction:value.direction,view:value.view,phase:unit(value.phase,path+'.phase',{nullable:false}),capturedAt:date(value.capturedAt,path+'.capturedAt'),sourceVersion:sourceVersion(value.sourceVersion??defaultVersion,path+'.sourceVersion'),image,contact:contact(value.contact,path+'.contact')};
}

export function importReviewPackage(input,catalog){
  if(typeof input!=='string'||input.length>MAX_TEXT)failure('檔案','請使用 16 MB 以內的工作台 JSON');let payload;try{payload=JSON.parse(input);}catch{failure('檔案','JSON 格式無效');}
  object(payload,'檔案');if(payload.brand!=='肌動基地'||![2,3].includes(payload.version))failure('version','不是支援的肌動基地工作台格式');
  const legacy=payload.version===2,version=legacy?'legacy-v013-unversioned':sourceVersion(payload.sourceVersion,'sourceVersion');
  if(!legacy&&payload.professionalSignoff!==false)failure('professionalSignoff','此工具不匯入專業認證');
  if(!Array.isArray(payload.records)||payload.records.length>MAX_RECORDS)failure('records','最多 500 筆檢查紀錄');
  if(payload.evidence!==undefined&&(!Array.isArray(payload.evidence)||payload.evidence.length>MAX_EVIDENCE))failure('evidence','最多 100 張實際截圖');
  const ids=new Set(catalog.map(item=>item.id)),records=payload.records.map((item,index)=>record(item,index,ids,version)),captures=(payload.evidence||[]).map((item,index)=>evidence(item,index,ids,version));
  return{records,evidence:captures,warnings:legacy?['舊版檔案未記錄精確來源版本，已標示為歷史意見，不能視為目前版本已審查。']:[],sourceVersion:version};
}

const recordKey=value=>JSON.stringify([value.id,value.stage,value.status,value.reviewer,value.qualification,value.notes,value.createdAt,value.sourceVersion,value.inspection]);
export function mergeReviewRecords(existing,incoming){const seen=new Set(existing.map(recordKey)),records=[...existing];let added=0;for(const item of incoming){const key=recordKey(item);if(seen.has(key))continue;seen.add(key);records.push(item);added++;}if(records.length>MAX_RECORDS)failure('records','合併後超過 500 筆，請先保留分批匯出檔');return{records,added};}
export function reviewChecklist(catalog,records,version=REVIEW_SOURCE_VERSION){return catalog.map(item=>{const latest=records.filter(record=>record.id===item.id).reduce((best,record)=>!best||record.createdAt>=best.createdAt?record:best,null),current=latest?.sourceVersion===version&&latest.status!=='reviewed';return{id:item.id,name:item.name,status:current?latest.status:'pending',latest:latest??null,currentVersion:current,source:item.source??null};});}

export function createReviewPackage({catalog,records,evidence=[],now=new Date().toISOString(),source=REVIEW_SOURCE_VERSION}){
  const payload={version:REVIEW_FORMAT_VERSION,brand:'肌動基地',sourceVersion:source,generatedAt:now,professionalSignoff:false,scope:'填表人意見與實際擷取畫面，不代表資格認證或所有姿勢皆安全。',records,evidence};
  // Use the same strict parser for locally made and externally supplied data.
  const verified=importReviewPackage(JSON.stringify(payload),catalog);
  return{...payload,records:verified.records,evidence:verified.evidence,checklist:reviewChecklist(catalog,verified.records,source).map(({latest,...item})=>({...item,latestReviewer:latest?.reviewer||'',latestAt:latest?.createdAt||null}))};
}

export function reviewHTML(payload,catalog){
  const checked=importReviewPackage(JSON.stringify(payload),catalog),rows=reviewChecklist(catalog,checked.records,payload.sourceVersion),safeURL=value=>/^https:\/\//.test(value||'')?esc(value):'#';
  return`<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>肌動基地：離線動作審查包</title><style>body{max-width:1100px;margin:30px auto;padding:0 20px;font:16px/1.7 system-ui;color:#21372c;background:#edf0e8}h1,h2,h3{line-height:1.4}section,article{background:#fff;padding:22px;border:1px solid #d0d8c8;border-radius:12px;margin:20px 0}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #d0d8c8;padding:9px}img{width:min(100%,480px);height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}a{color:#285d3b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.notice{background:#fff1d9;padding:18px}.meta{color:#596959;font-size:14px}p{white-space:pre-wrap}</style><h1>肌動基地：離線動作審查包</h1><p class="notice"><strong>填表人意見，不代表資格認證。</strong>沒有代填真人教練簽名；未拍攝的方向與階段不算已檢查，靜態圖片不能代替觀看完整連續動作。</p><p>來源版本：${esc(payload.sourceVersion)} · 匯出：${esc(payload.generatedAt)}</p><section><h2>65 個動作／課程的審查狀態</h2><table><thead><tr><th>動作</th><th>本版狀態</th><th>教學參考</th></tr></thead><tbody>${rows.map(row=>`<tr><td><a href="#${esc(row.id)}">${esc(row.name)}</a></td><td>${esc(REVIEW_STATUSES[row.status])}${row.latest&&!row.currentVersion?'（只有舊版意見）':''}</td><td>${row.source?.url?`<a href="${safeURL(row.source.url)}" rel="noopener noreferrer">${esc(row.source.label)}</a>`:'未附來源'}</td></tr>`).join('')}</tbody></table></section>${rows.map(row=>{const notes=checked.records.filter(item=>item.id===row.id),pictures=checked.evidence.filter(item=>item.id===row.id);return`<section id="${esc(row.id)}"><h2>${esc(row.name)}</h2><p>${esc(REVIEW_STATUSES[row.status])} · 證據 ${pictures.length} 張</p>${!notes.length?'<p>尚無填表人意見。</p>':notes.map(note=>`<article><h3>${esc(note.stage)} · ${esc(REVIEW_STATUSES[note.status])}</h3><p>${esc(note.notes)}</p><p class="meta">填表人：${esc(note.reviewer)} · 自填身分：${esc(note.qualification||'未填')} · ${esc(note.createdAt)} · 來源 ${esc(note.sourceVersion)}</p>${note.inspection?`<p>位置：${esc(directions[note.inspection.direction])} ${Math.round(note.inspection.phase*100)}%</p>`:''}${note.image?`<img src="${note.image}" alt="紀錄所附${esc(views[note.view]||'實際')}截圖">`:'<p>這筆紀錄未附截圖。</p>'}${note.contact?`<details><summary>擷取時的接點診斷</summary><pre>${esc(JSON.stringify(note.contact,null,2))}</pre></details>`:''}</article>`).join('')}<div class="grid">${pictures.map(picture=>`<article><h3>${esc(directions[picture.direction])} · ${esc(views[picture.view])}</h3><p>${Math.round(picture.phase*100)}% · ${esc(picture.capturedAt)} · 來源 ${esc(picture.sourceVersion)}</p><img src="${picture.image}" alt="${esc(row.name)}的${esc(directions[picture.direction])}${esc(views[picture.view])}實際截圖"></article>`).join('')}</div></section>`;}).join('')}<p>本檔包含填表人自填姓名、身分、意見及所附畫面，不會自動讀取私人帳號或訓練日誌。內容可離線閱讀，參考來源連結需要網路。</p></html>`;
}

export function reviewCSV(payload,catalog){
  const {records}=importReviewPackage(JSON.stringify(payload),catalog),names=new Map(catalog.map(item=>[item.id,item.name]));
  const cell=value=>{const text=String(value??''),safe=/^[=+\-@\t\r]/.test(text)?"'"+text:text;return'"'+safe.replaceAll('"','""')+'"';};
  const rows=[['動作ID','動作','段落','結果（填表人意見）','填表人','自填身分','意見','來源版本','填寫日期','查看段落','相位','附圖','專業認證']];
  for(const r of records)rows.push([r.id,names.get(r.id),r.stage,REVIEW_STATUSES[r.status],r.reviewer,r.qualification,r.notes,r.sourceVersion,r.createdAt,r.inspection?.direction??'',r.inspection?.phase??r.phase??'',r.image?'有':'無','未認證']);
  return'\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
