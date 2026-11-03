import {readFileSync,writeFileSync} from 'node:fs';
import {catalogActivities} from '../src/activity-catalog.js';
const read=name=>JSON.parse(readFileSync(`docs/research/public-teaching-${name}-v020.json`,'utf8'));
const machine=read('machines'),free=read('free-weights'),cable=read('cable-stretch-classes');
const rows=new Map(),date='2026-11-03';
const stageNames={setup:'起始設定',movement:'主要動作',loop:'主要動作',return:'控制回程',exit:'離開程序'};
const source=(raw,section='')=>({label:`${raw.publisher||raw.organization}${section?' · '+section:''}`,title:raw.title,url:raw.url||raw.verifiedURL});
const base=(id,kind,sources,scope)=>({id,kind,checkedOn:date,source:sources[0]||null,sources,scope,checkedParts:[],gaps:[],cues:[],animation:{status:'not-reviewed',notes:'本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。'},professionalSignoff:false});
for(const item of machine.activities){
  const sources=item.sourceIds.map(id=>machine.sources.find(s=>s.id===id)).filter(Boolean).map(s=>source(s,item.section));
  let kind=item.status==='source-reviewed'?'direct_instruction':sources.length?'equipment_only':'unverified';
  if(['machine-seated-row','machine-hip-thrust','machine-decline-chest-press'].includes(item.id))kind='related_variant';
  if(['machine-bike','machine-treadmill'].includes(item.id))kind='partial_instruction';
  const row=base(item.id,kind,sources,item.equipmentScope);
  row.checkedParts=[...new Set(Object.entries(item.coverage).filter(([,value])=>value===true).map(([key])=>stageNames[key]))];
  row.gaps=Object.entries(item.coverage).filter(([,value])=>value!==true).map(([key,value])=>`${stageNames[key]}${value&&value!==false?'僅部分參考':'尚未涵蓋'}`);
  row.cues=item.cues;row.sourceTargets=item.targetMuscles;
  const findings=(item.findingIds||[]).map(id=>machine.codeFindings.find(f=>f.id===id)).filter(Boolean);
  row.findings=findings;
  if(item.id==='machine-leg-press')row.animation={status:'needs-work',notes:'目前退場未示範斜軌雪橇的安全停靠扣件；這段仍須補機構與操作，不當成完整上下機教學。'};
  if(item.id==='machine-elliptical')row.animation={status:'needs-work',notes:'目前缺固定扶手，退場過早放手；尚未符合所讀手冊的扶握跨下順序。'};
  if(item.id==='machine-decline-chest-press')row.gaps.push('來源是坐姿機；未涵蓋遊戲躺式下斜機的固定與進出。');
  if(item.id==='machine-plate-high-row')row.scope='已讀 IL-HR 高位划船的設定與拉回原則；遊戲機臂為簡化版本，沒有胸墊，文字依現有大腿墊與坐姿修正。';
  rows.set(item.id,row);
}
for(const item of free.entries){
  const references=item.referenceIds.map(id=>free.sources.find(s=>s.id===id));
  if(references.some(s=>!s||!s.opened))throw Error(`Unread source: ${item.exerciseId}`);
  if(item.exerciseId==='machine-smith-squat')references.sort((a,b)=>Number(b.id==='cybex-ion-smith-manual')-Number(a.id==='cybex-ion-smith-manual'));
  const kind=['dumbbell-single-arm-row','machine-smith-squat'].includes(item.exerciseId)?'related_variant':'direct_instruction';
  const row=base(item.exerciseId,kind,references.map(s=>source(s)),item.sourceScope);
  row.checkedParts=[...new Set(item.coveredStages.map(key=>stageNames[key]))];
  row.cues=Object.values(item.teaching).filter(Boolean);
  row.gaps=[item.lifecycleCoverage||references[0].coverageLimits].filter(Boolean);
  row.findings=item.codeFindings;row.sourceTargets=item.targetMuscles;
  rows.set(item.exerciseId,row);
}
for(const item of cable.activities){
  const references=item.references.map(id=>cable.references.find(s=>s.id===id));
  if(references.some(s=>!s||!s.read))throw Error(`Unread source: ${item.id}`);
  const kind=({class_type_intro:'course_type',equipment_reference_only:'equipment_only'})[item.classification]||item.classification;
  const row=base(item.id,kind,references.map(s=>source(s)),references.map(s=>s.scope).join(' '));
  if(kind==='direct_instruction')row.checkedParts=['起始設定','主要動作','控制回程'];
  if(kind==='related_variant')row.checkedParts=['相關變式的動作原則'];
  row.cues=[item.setup,item.movement,item.return].filter(Boolean);
  row.gaps=item.cautions||[];row.sourceTargets=item.muscleTargets;
  if(item.id.startsWith('class-')||item.id==='group-class'){
    row.gaps.push('未逐段對照本遊戲整堂課、47 種課內動作與全部進出程序。');
    row.animation={status:'not-reviewed',notes:'課程形式或設備資料不代表整堂課已核對。'};
  }
  if(item.id==='cable-straight-arm-pulldown'){
    if(item.animationReview==='corrected-and-cpu-geometry-checked')row.animation={status:'corrected-checked',notes:'已依真實骨長重算路徑，手肘改為接近伸直的小幅彎曲；通過實際模型與握把接觸檢查，未當成真人教練簽核。'};
    else row.animation={status:'needs-work',notes:'已量到原軌道讓手肘夾角約 110°，與伸長手臂的教學不符；修正結果另以實際模型驗證。'};
    row.gaps.push('遊戲展示行程仍依既定站位配置，不是個人化活動範圍。');
  }
  rows.set(item.id,row);
}
const catalog=catalogActivities.filter(item=>item.runtime!=='facility'||item.classKind);
const records=catalog.map(item=>{const row=rows.get(item.id);if(!row)throw Error(`Missing teaching check: ${item.id}`);if(!row.source||!row.sources.every(s=>/^https:\/\//.test(s.url)))throw Error(`Invalid reference: ${item.id}`);return row;});
if(records.length!==65||new Set(records.map(row=>row.id)).size!==65)throw Error('Expected 65 distinct activities.');
writeFileSync('src/teaching-reference-data-v020.js',`// Dated public-source checks. These are not professional approval or motion capture.\nexport const TEACHING_REFERENCE_DATE='${date}';\nexport const teachingReferenceChecks=${JSON.stringify(records,null,2)};\n`);
console.log(JSON.stringify({entries:records.length,counts:records.reduce((counts,row)=>(counts[row.kind]=(counts[row.kind]||0)+1,counts),{}),uniqueSources:new Set(records.flatMap(row=>row.sources.map(s=>s.url))).size}));
