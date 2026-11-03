/** Shared data rules for explicit, user-entered exercise logs and sync. */
export const JOURNAL_SCHEMA=1;
export const WEIGHT_BASES=Object.freeze([['total','總重量'],['per-hand','每手'],['per-side','每側（不含槓）'],['added','額外負重'],['bodyweight','徒手']]);
const isoDate=/^\d{4}-\d{2}-\d{2}$/,identifier=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;
const fail=message=>{throw new Error(message);};
const finite=(value,min,max,label,{nullable=true,integer=false}={})=>{
 if(value===''||value===null||value===undefined){if(nullable)return null;fail(`請填寫${label}。`);}
 const number=Number(value);if(!Number.isFinite(number)||number<min||number>max||integer&&!Number.isInteger(number))fail(`${label}超出可記錄的範圍。`);return number;
};
export function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function validDate(value){return typeof value==='string'&&isoDate.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;}
export function journalId(){return globalThis.crypto?.randomUUID?.()||`log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}
export function normalizeJournalEntry(value,{now=new Date().toISOString()}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('紀錄格式不正確。');
 const id=value.id||journalId();if(typeof id!=='string'||!identifier.test(id))fail('紀錄編號格式不正確。');
 if(!validDate(value.date))fail('請選擇有效的訓練日期。');
 if(typeof value.exerciseId!=='string'||!identifier.test(value.exerciseId))fail('請選擇動作。');
 if(!Array.isArray(value.sets)||value.sets.length<1||value.sets.length>30)fail('每筆紀錄需要 1～30 組。');
 const sets=value.sets.map((set,index)=>{
  if(!set||typeof set!=='object')fail(`第 ${index+1} 組格式不正確。`);
  const result={id:typeof set.id==='string'&&identifier.test(set.id)?set.id:journalId(),weightKg:finite(set.weightKg,0,2000,'重量'),reps:finite(set.reps,1,1000,'次數',{integer:true}),durationSeconds:finite(set.durationSeconds,1,86400,'秒數',{integer:true}),effort:finite(set.effort,1,10,'吃力程度',{integer:true})};
  if(result.reps===null&&result.durationSeconds===null)fail(`第 ${index+1} 組請填次數或秒數。`);return result;
 });
 const timestamp=name=>typeof value[name]==='string'&&Number.isFinite(Date.parse(value[name]))?new Date(value[name]).toISOString():now;
 return{id,date:value.date,exerciseId:value.exerciseId,weightBasis:WEIGHT_BASES.some(([key])=>key===value.weightBasis)?value.weightBasis:'total',sets,notes:String(value.notes||'').slice(0,1000),createdAt:timestamp('createdAt'),updatedAt:timestamp('updatedAt'),deleted:value.deleted===true};
}
export function normalizeSyncProfile(value={}){
 const v=value&&typeof value==='object'?value:{};
 return{goal:['strength','cardio','mobility'].includes(v.goal)?v.goal:'strength',focus:['fullbody','chest','back','legs','shoulders','arms'].includes(v.focus)?v.focus:'fullbody',experience:v.experience==='regular'?'regular':'new',minutes:[15,30,45].includes(Number(v.minutes))?Number(v.minutes):30,volumeStep:Math.max(-1,Math.min(1,Math.round(Number(v.volumeStep)||0)))};
}
export function normalizeSnapshot(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('同步資料格式不正確。');
 if(value.schema!==undefined&&value.schema!==JOURNAL_SCHEMA)fail('這份資料使用不同版本，請先更新網頁。');
 if(value.entries!==undefined&&!Array.isArray(value.entries))fail('訓練日誌格式不正確。');
 if((value.entries?.length||0)>2000)fail('每份日誌最多 2,000 筆，請先匯出備份。');
 const entries=(value.entries||[]).map(entry=>normalizeJournalEntry(entry));
 if(new Set(entries.map(entry=>entry.id)).size!==entries.length)fail('紀錄編號重複，請檢查匯入檔。');
 const ids=list=>{if(list!==undefined&&!Array.isArray(list))fail('學習進度格式不正確。');if((list?.length||0)>1000)fail('學習進度超出範圍。');return [...new Set((list||[]).filter(id=>typeof id==='string'&&identifier.test(id)))].sort();};
 return{schema:JOURNAL_SCHEMA,entries:entries.sort((a,b)=>a.id.localeCompare(b.id)),learned:ids(value.learned),knowledge:ids(value.knowledge),profile:normalizeSyncProfile(value.profile)};
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=value=>{let result=2166136261;for(const ch of JSON.stringify(value)){result^=ch.charCodeAt(0);result=Math.imul(result,16777619);}return(result>>>0).toString(16);};
/** Three-way merge. Truly competing edits become visible copies, never silent overwrites. */
export function mergeSyncSnapshots(local,remote,{base={},profileChoice='local'}={}){
 const left=normalizeSnapshot(local),right=normalizeSnapshot(remote),previous=normalizeSnapshot(base),byId=new Map(),old=new Map(previous.entries.map(entry=>[entry.id,entry])),conflicts=[];
 for(const entry of left.entries)byId.set(entry.id,entry);
 for(const entry of right.entries){
  const current=byId.get(entry.id),prior=old.get(entry.id);
  if(!current||equal(current,entry))byId.set(entry.id,entry);
  else if(prior&&equal(current,prior))byId.set(entry.id,entry);
  else if(prior&&equal(entry,prior))continue;
  else{const baseId=`${entry.id.slice(0,76)}-copy-${hash(entry)}`,copy={...entry,id:baseId};let suffix=1;while(byId.has(copy.id)&&!equal(byId.get(copy.id),copy))copy.id=`${baseId.slice(0,88)}-${++suffix}`;byId.set(copy.id,copy);conflicts.push({id:entry.id,copyId:copy.id,localDeleted:current.deleted,remoteDeleted:entry.deleted});}
 }
 const localProfileChanged=!equal(left.profile,previous.profile),remoteProfileChanged=!equal(right.profile,previous.profile);
 const profile=localProfileChanged&&remoteProfileChanged?(profileChoice==='remote'?right.profile:left.profile):remoteProfileChanged?right.profile:left.profile;
 return{snapshot:normalizeSnapshot({entries:[...byId.values()],learned:[...left.learned,...right.learned],knowledge:[...left.knowledge,...right.knowledge],profile}),conflicts};
}
export function journalSummary(entries,{date=localDate(),period='day'}={}){
 if(!validDate(date))fail('日期格式不正確。');
 const anchor=new Date(`${date}T00:00:00Z`),start=new Date(anchor),end=new Date(anchor);
 if(period==='week'){start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));end.setTime(start.getTime());end.setUTCDate(end.getUTCDate()+6);}
 const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10),items=entries.filter(entry=>!entry.deleted&&(period==='all'||entry.date>=from&&entry.date<=to));
 return{from,to,entries:items.length,days:new Set(items.map(entry=>entry.date)).size,sets:items.reduce((n,entry)=>n+entry.sets.length,0),reps:items.reduce((n,entry)=>n+entry.sets.reduce((sum,set)=>sum+(set.reps||0),0),0),durationSeconds:items.reduce((n,entry)=>n+entry.sets.reduce((sum,set)=>sum+(set.durationSeconds||0),0),0),items:items.sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt))};
}
export function journalExport(snapshot){return JSON.stringify({format:'form.training-journal.v1',exportedAt:new Date().toISOString(),...normalizeSnapshot(snapshot)},null,2);}
export function journalImport(text,current){
 let value;try{value=JSON.parse(text);}catch{fail('檔案不是有效的 JSON。');}
 if(value.format!=='form.training-journal.v1')fail('請選擇從訓練日誌匯出的 JSON 檔。');
 const result=mergeSyncSnapshots(current,normalizeSnapshot(value));return{...result,importedEntries:result.snapshot.entries.filter(entry=>!entry.deleted).length-normalizeSnapshot(current).entries.filter(entry=>!entry.deleted).length};
}
export function journalCSV(snapshot,names={}){
 const cell=value=>{let text=String(value??'');if(/^(?:\s*[=+\-@]|[\t\r])/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};
 const rows=[['日期','動作','動作編號','組別','重量 kg','重量基準','次數','秒數','吃力程度 1–10','備註']];
 for(const entry of normalizeSnapshot(snapshot).entries.filter(entry=>!entry.deleted))entry.sets.forEach((set,index)=>rows.push([entry.date,names[entry.exerciseId]||entry.exerciseId,entry.exerciseId,index+1,set.weightKg,WEIGHT_BASES.find(([id])=>id===entry.weightBasis)?.[1],set.reps,set.durationSeconds,set.effort,entry.notes]));
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
