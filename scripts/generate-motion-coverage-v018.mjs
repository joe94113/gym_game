import {catalogActivities} from '../src/activity-catalog.js';
import {motionSourceInfo,motionDataCredits} from '../src/motion-sources-v018.js';
import {capturedTransitionScope} from '../src/captured-transition-v018.js';
import {transitionCaptureClips} from '../src/captured-transition-data-v018.js';
import {REVIEW_SOURCE_VERSION,REVIEW_DIRECTIONS,REVIEW_VIEWS} from '../src/motion-review-data-v015.js';
import {createMocapFixtureV018} from './mocap-fixture-v018.mjs';
import {applyAdditionalVariants} from '../src/additional-equipment.js';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const output='artifacts/mocap-v018/motion-coverage.json',docPath='docs/captured-motion-v018.md';
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const tracked=['src/activity-catalog.js','src/motion-sources-v018.js','src/inertial-curl-v018.js','src/lateral-reference-v018.js','src/lower-body-capture-v018.js','src/captured-pose-v017.js','src/captured-transition-v018.js','src/captured-transition-data-v018.js','src/rig-lifecycle.js','src/machine-lifecycle.js','src/extended-rig.js','src/exercise-rig.js','src/additional-equipment.js','src/motion-review-data-v015.js','scripts/mocap-fixture-v018.mjs','scripts/generate-motion-coverage-v018.mjs','public/models/athlete/athlete.glb','public/models/athlete/rig.json'];
const sourceHashes=Object.fromEntries(tracked.map(path=>[path,sha(path)])),fixture=await createMocapFixtureV018(),activities=[],errors=[];
// The general fixture serves mocap tests but does not install the production
// pec-deck/reverse-fly wrapper. Without it the reverse fly would be incorrectly
// inspected as the ordinary forward-facing pec deck and counted as captured.
applyAdditionalVariants(fixture.machines,{scene:fixture.scene,characterMetrics:fixture.metrics,materials:Object.fromEntries(['graphite','steel','chrome','black','accent'].map(key=>[key,new fixture.THREE.MeshStandardMaterial()])),geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});
const unique=values=>[...new Set(values)],plain=value=>JSON.parse(JSON.stringify(value));
function captureRecord(frame,mode,phase){const timing=frame?.transitionTiming;if(!timing)return null;const clip=transitionCaptureClips.find(c=>c.id===timing.captureId);if(!clip||clip.sourceRef!==timing.sourceRef||clip.fps!==timing.sourceFPS||JSON.stringify(timing.sourceFrames)!==JSON.stringify([clip.first,clip.last])||timing.sourceDirection!==clip.sourceDirection)throw Error('Runtime source provenance does not match imported clip');return{direction:mode,sampledPhase:phase,stage:frame.stage,role:timing.role,captureId:timing.captureId,sourceRef:timing.sourceRef,sourceFrames:timing.sourceFrames,sourceFPS:timing.sourceFPS,sourceDirection:timing.sourceDirection,segmentRange:timing.segmentRange,sourceAction:timing.sourceAction,adaptation:timing.adaptation};}
function recordCoverage(metadata,sample,storedDirection){
 const applied=[],rejected=[];for(const segment of metadata.segments){const mid=(segment.range[0]+segment.range[1])/2;if(segment.range[1]<=segment.range[0])continue;
  for(const mode of ['enter','exit']){const phase=mode===storedDirection?mid:1-mid,profile=segment[mode],frame=sample(mode,phase),actual=captureRecord(frame,mode,phase);
   if(profile?.applied){if(!actual||actual.captureId!==profile.captureId||actual.role!==profile.role)throw Error('Planned profile is not actually applied at runtime midpoint');applied.push({...actual,storedStage:segment.stage});}
   else{if(actual)throw Error('Unexpected source profile absent from runtime metadata');rejected.push({direction:mode,stage:segment.stage,range:segment.range,reason:profile?.reason||'authored-runtime-path'});}
  }
 }return{applied,rejected};
}
try{for(const activity of catalogActivities.filter(a=>a.runtime!=='facility'||a.classKind)){
 const source=motionSourceInfo(activity.id),row={id:activity.id,name:activity.name,runtime:activity.runtime,stationId:activity.stationId,type:activity.type||null,classKind:activity.classKind||null,muscleKeys:[...(activity.muscleKeys||[])],secondaryMuscleKeys:[...(activity.secondaryMuscleKeys||[])],loop:source?{status:source.kind,sourceId:source.sourceId,info:plain(source)}:{status:'authored',sourceId:null,scope:'No matching public capture is integrated for this loop. Imported source clips and reference articles do not constitute applied motion capture.'},transitions:{status:'authored',sourcePoseApplied:false,appliedSegments:[],rejectedSegments:[],inspection:null},professionalReview:{status:'pending',professionalSignoff:false,reviewer:null,qualification:null,reviewedAt:null,sourceVersion:REVIEW_SOURCE_VERSION},review:{directions:[...REVIEW_DIRECTIONS],views:[...REVIEW_VIEWS],matrix:REVIEW_DIRECTIONS.flatMap(direction=>REVIEW_VIEWS.map(view=>({direction,view,evidence:null,status:'pending'}))),focus:['approach-and-position','sit-or-mount-and-support','grip-and-equipment-contact','complete-exercise-range','return-release-and-departure','primary-and-secondary-target-muscle-labels']}};
 try{
  if(activity.runtime==='rig'){
   fixture.rig.prepare(activity.id);let metadata=fixture.rig.getCapturedTransitionCoverage?.(activity.id);
   if(!metadata){const lifecycle=fixture.rig.getLifecycle(activity.id),total=lifecycle.stages.reduce((sum,s)=>sum+s.duration,0);let elapsed=0;metadata={enabled:true,segments:lifecycle.stages.map(s=>{const from=elapsed;elapsed+=s.duration;return{stage:s.label,range:[from/total,elapsed/total]};})};const applied=[];for(const s of metadata.segments)for(const mode of ['enter','exit']){const mid=(s.range[0]+s.range[1])/2,phase=mode==='enter'?mid:1-mid,actual=captureRecord(fixture.rig.sampleLifecycle(activity.id,mode,phase),mode,phase);if(actual)applied.push(actual);}row.transitions.appliedSegments=applied;row.transitions.inspection='Actual current GLB fixture: lifecycle-stage midpoint frames (coverage getter unavailable).';}
   else{const inspected=recordCoverage(metadata,(direction,p)=>fixture.rig.sampleLifecycle(activity.id,direction,p),'enter');row.transitions.appliedSegments=inspected.applied;row.transitions.rejectedSegments=inspected.rejected;row.transitions.inspection='Actual current GLB fixture: lifecycle metadata and every enter/exit segment midpoint frame.';}
   fixture.rig.end({keepVisible:false});
  }else if(activity.runtime==='machine'){
   const machine=fixture.machines.get(activity.stationId);if(!machine)throw Error('Canonical catalog machine missing in fixture');const lifecycle=fixture.createMachineLifecycle({THREE:fixture.THREE,machine,metrics:fixture.metrics,activityId:activity.id});lifecycle.sample('enter',0);const metadata=lifecycle.getCapturedTransitionCoverage?.();
   if(metadata){const inspected=recordCoverage(metadata,(direction,p)=>lifecycle.sample(direction,p),'exit');row.transitions.appliedSegments=inspected.applied;row.transitions.rejectedSegments=inspected.rejected;row.transitions.inspection='Actual current GLB fixture: lazy machine lifecycle initialized, metadata and every enter/exit segment midpoint frame.';}
   else{for(const mode of ['enter','exit'])for(const phase of [0,.5,1]){const actual=captureRecord(lifecycle.sample(mode,phase),mode,phase);if(actual)throw Error('Custom machine returned capture without coverage metadata');}row.transitions.inspection='Actual custom machine lifecycle has no captured-timing coverage hook; start/mid/end frames checked in both directions. Custom mounting path remains authored.';}
  }else row.transitions.inspection='Group-class runtime has no integrated public captured-transition timing mapping. Class choreography and entry/exit remain authored.';
  if(row.transitions.appliedSegments.length)row.transitions.status='measured-timing-on-authored-path';
  row.transitions.appliedRoles=unique(row.transitions.appliedSegments.map(s=>s.role));row.transitions.appliedClipIds=unique(row.transitions.appliedSegments.map(s=>s.captureId));
 }catch(error){errors.push({id:activity.id,error:String(error.stack||error)});row.transitions.inspectionError=String(error.message);fixture.rig.end({keepVisible:false});}
 activities.push(row);
}}finally{fixture.character.dispose();}

function evidence(path){if(!existsSync(path))return{path,status:'pending-not-yet-produced',pass:null};const report=JSON.parse(readFileSync(path));const hashes=report.sourceHashes||report.hashes||{},currentSourceChanges=Object.entries(hashes).filter(([p,h])=>existsSync(p)&&sha(p)!==h).map(([p])=>p),wristMatrix=report.phaseCount&&report.rows?.every(row=>row.before&&row.after),currentPoses=wristMatrix?report.phaseCount*2*report.rows.length:null;return{path,status:'recorded',pass:report.pass??null,sha256:sha(path),currentSourceChanges,sourceStableAtMeasurement:!(report.changedSources?.length||report.changedBaselineSources?.length),totalPoses:report.totalPoses??(currentPoses!==null?2*currentPoses:null)??report.rows?.reduce((sum,r)=>sum+(r.poses||0),0)??report.row?.poses??report.poses??null,...(currentPoses!==null?{currentPoses,baselinePoses:currentPoses}:{}),report};}
const proofs={transitions:evidence('artifacts/mocap-v018/captured-transition-qualification.json'),lowerBody:evidence('artifacts/mocap-v018/lower-body-qualification-final.json'),lateral:evidence('artifacts/mocap-v018/lateral-reference-qualification-final.json'),inertialCurl:evidence('artifacts/mocap-v018/inertial-curl-qualification-first.json'),openHandWrist:evidence('artifacts/mocap-v018/open-hand-wrist-qualification.json'),seatedRowCrossing:evidence('artifacts/mocap-v018/seated-row-crossing-qualification.json')};
const byKind=activities.reduce((counts,a)=>(counts[a.loop.status]=(counts[a.loop.status]||0)+1,counts),{}),sourceBacked=activities.filter(a=>a.loop.status!=='authored'),appliedTransitions=activities.filter(a=>a.transitions.appliedSegments.length),changedSources=tracked.filter(path=>sha(path)!==sourceHashes[path]);
const counts={canonicalCatalog:catalogActivities.length,exerciseAndCourse:activities.length,nonExerciseFacilities:catalogActivities.length-activities.length,groupCourses:activities.filter(a=>a.classKind).length,sourceBackedLoops:sourceBacked.length,authoredLoops:byKind.authored||0,loopKinds:byKind,appliedTransitionActivities:appliedTransitions.length,appliedDirectionalTransitionSegments:appliedTransitions.reduce((sum,a)=>sum+a.transitions.appliedSegments.length,0),availableTransitionClips:transitionCaptureClips.length,actuallyAppliedTransitionClips:unique(appliedTransitions.flatMap(a=>a.transitions.appliedClipIds)).length,professionalPending:activities.length,professionalApproved:0};
if(counts.canonicalCatalog!==73||counts.exerciseAndCourse!==65||counts.sourceBackedLoops!==17||counts.authoredLoops!==48||counts.appliedTransitionActivities!==18)errors.push({reason:'Current catalog/loop/actual-transition counts differ from expected v0.18 scope',counts});
const coverage={schemaVersion:1,version:REVIEW_SOURCE_VERSION,generatedAt:new Date().toISOString(),status:errors.length||changedSources.length?'inspection-errors':'current-runtime-coverage',counts,sourceHashes,changedSources,inspectionErrors:errors,scope:'Loop source references, actually applied transition timing, and professional review are independent dimensions. No clip is counted as applied merely because it was imported. GLB fixture uses current production geometry and rig code without GPU rendering. No professional approval is inferred from code, numerical QA, articles or imported motion.',transitionScope:capturedTransitionScope,sourceCredits:motionDataCredits,activities,nonExerciseFacilities:catalogActivities.filter(a=>a.runtime==='facility'&&!a.classKind).map(a=>({id:a.id,name:a.name,status:'excluded-from-65-exercise-review'})),evidence:Object.fromEntries(Object.entries(proofs).map(([key,{report,...item}])=>[key,item]))};
mkdirSync('artifacts/mocap-v018',{recursive:true});writeFileSync(output,JSON.stringify(coverage,null,2));

const mm=value=>Number(value||0)*1000,fmt=(value,digits=3)=>Number(value).toFixed(digits),escape=value=>String(value??'').replaceAll('|','／').replaceAll('\n',' ');
const labels={'authored':'手工動畫','source-driven-multi-joint-retarget-with-contact-IK':'多關節參考＋接點校正','upper-arm-reference-and-tempo':'上臂平面參考＋節奏','pelvis-reference-and-tempo':'骨盆小幅參考＋節奏','measured-tempo':'下肢量測節奏','measured-imu-tempo':'IMU 量測節奏'};
const sourceRows=sourceBacked.map(a=>`| ${escape(a.name)}（\`${a.id}\`） | ${labels[a.loop.status]} | ${escape(a.loop.sourceId)} | 待教練審查 |`).join('\n');
const checklist=activities.map(a=>`| ${escape(a.name)}（\`${a.id}\`） | ${labels[a.loop.status]} | ${a.transitions.appliedSegments.length?'部分段落套量測節奏':'手工路徑'} | 待審／未簽核 |`).join('\n');
const wrist=proofs.openHandWrist.report,wristRows=wrist?.rows?.map(r=>`| ${r.id} | ${fmt(r.before.open.max,2)}° → ${fmt(r.after.open.max,2)}° | ${fmt(r.before.held.max,2)}° → ${fmt(r.after.held.max,2)}° | ${fmt(mm(r.after.maxMetalDepth))} mm |`).join('\n')||'| 專項報告尚未產生 | — | — | — |';
const transitionProof=proofs.transitions.report,lower=proofs.lowerBody.report,lateral=proofs.lateral.report,imu=proofs.inertialCurl.report,rowFix=proofs.seatedRowCrossing.report;
const proofLine=(key,label)=>{const p=proofs[key];return`- ${label}：[${p.path.split('/').at(-1)}](../${p.path})，${p.status==='recorded'?(p.pass?'當次數值檢查通過':'當次檢查未通過'):'尚未產生，待確認'}${p.currentSourceChanges?.length?'；後續另有來源檔變更，這份歷史結果不等於目前整包已重驗':''}。`;};
const doc=`# 肌動基地 0.18 真人動作來源與備審

目前有 ${counts.canonicalCatalog} 個去重後的目錄項目，其中 ${counts.exerciseAndCourse} 個是運動或團課，另外 ${counts.nonExerciseFacilities} 個是設施。${counts.sourceBackedLoops} 個循環動作用到真人量測參考：2 個多關節、1 個上臂平面、1 個小幅骨盆參考，以及 13 個節奏參考。其餘 ${counts.authoredLoops} 個循環仍是手工動畫。${counts.groupCourses} 種團課都還是手工編排。

${counts.appliedTransitionActivities} 類動作的部分就位／離開段落，實際套用了量測節奏；這與循環動作的 17 項來源是兩種統計。所有 ${counts.professionalPending} 個運動／課程都待真人教練逐項審查，沒有任何專業簽核。

完整逐項資料與實際套用段落見 [motion-coverage.json](../${output})。重建指令：\`node scripts/generate-motion-coverage-v018.mjs\`。本檔由程式依目前目錄、來源 registry、正式 GLB fixture 與 lifecycle metadata 產生，不把「已下載」當成「已接入」。

## 目前用到哪些真人資料

| 動作 | 實際接入的部分 | 來源 ID | 教練狀態 |
| --- | --- | --- | --- |
${sourceRows}

CMU 肩推與深蹲沿用 0.17 的多關節參考和手腳接點校正，並非逐骨原樣播放。原深蹲沒有負重，遊戲改成雙手持鈴的杯式深蹲；來源沒有拍到這個持鈴方式。

SAME-Limb 只提供骨盆與下肢外部標記。腿推、哈克、史密斯與槓鈴深蹲、腿伸展／腿彎舉、小腿機使用量測節奏；器材行程、姿勢、手腳與握把路徑仍由原設定控制。RDL 額外使用小幅骨盆位移，每軸上限 **8 mm**，向量長度的理論上限為 **13.86 mm**，不是整體位移只限 8 mm。來源的硬舉動作是搬一個放有兩包 A4 紙的箱子，沒有上肢光學標記，不能稱為完整啞鈴 RDL 動捕。

UI-PRMD 的側平舉參考來自右臂、無負重的復健肩外展。左臂是右臂方向的鏡射改編，沒有拍到真正雙側持鈴動作。遊戲保留原負重動作的抬臂範圍、手肘彎度、手腕與握把，只加入有限的上臂平面參考與節奏。另已匯入肩伸展與肩胛平面抬臂資料，尚未接到其他遊戲動作，未列為已完成覆蓋。

UCI 使用正確 A 類、1.25 kg 單側啞鈴彎舉的 IMU 資料。6 個彎舉變式共享兩段量測節奏，採 35% 來源參考和速度限制；雙側、槌式、滑輪、牧師椅的姿勢及器材路徑仍是原動畫。感測器 roll 不是臨床手肘角度，也不是完整骨架動捕。官方範例只有 4,024 列，未宣稱已匯入研究的全部 39,242 列。

紅橘標色繼續依動作目錄的主要／輔助肌群顯示；沒有輔助肌群的動作不硬加橘色群。這不是量測玩家的肌肉用力，也沒有用 SAME-Limb 的 EMG／AMG 來驅動皮膚顏色。

## 就位、拿取與離開

本次實際套用 ${counts.appliedDirectionalTransitionSegments} 個方向性段落，涉及 ${counts.appliedTransitionActivities} 類動作；可用轉場片段 ${counts.availableTransitionClips} 段，實際選用 ${counts.actuallyAppliedTransitionClips} 段。程式逐段比對 runtime metadata 與進出段落中點，只有真的回傳 \`transitionTiming\` 才計入。

量測內容是坐下／起身時骨盆的升降、彎身接近箱子／起身，以及原本已拿著啞鈴時的抬起／放低節奏。人物比例、原本的站位、路徑、手腳接點、握法與器材狀態沒有改成來源人物的姿勢。CMU 79_93 開始時已持鈴，不能拿它宣稱架上拿取、放回、放手都有真人實拍。

走路、跨步、轉身、變換握法、器材機構改變、特殊靠躺、槓架、TRX 與空中器材仍走原本的手工路徑。十種坐姿機器加八個啞鈴動作，只有符合條件的固定站位段落套節奏；同一動作的其他段落仍是手工動畫。JSON 分別列出每個已套用角色／片段，以及未套用的理由。

## 數值驗收與限制

${proofLine('transitions','轉場')}
${proofLine('lowerBody','下肢參考')}
${proofLine('lateral','上臂參考')}
${proofLine('inertialCurl','IMU 彎舉')}
${proofLine('openHandWrist','伸手與手腕')}
${proofLine('seatedRowCrossing','坐姿划船鞋尖')}

${transitionProof?`轉場專項取樣 ${transitionProof.rows.reduce((sum,r)=>sum+r.poses,0)} 個姿勢，其中 ${transitionProof.rows.reduce((sum,r)=>sum+r.capturedSamples,0)} 個樣本實際套節奏。`:'轉場最終數值報告尚未產生。'}${lower?`下肢專項取樣 ${lower.totalPoses} 個姿勢。`:'下肢最終報告尚未產生，這裡不填通過。'}${lateral?`上臂專項取樣 ${proofs.lateral.totalPoses} 個姿勢。`:'上臂最終報告待確認。'}${imu?`IMU 彎舉取樣 ${imu.totalPoses} 個姿勢，與同一行程進度的原版姿勢、骨架、器材與皮膚對照。`:'IMU 彎舉最終報告待確認。'}

坐姿划船的鞋尖另做原有跨軌路徑修正：${rowFix?`修正前完整鞋面取樣曾出現 ${fmt(mm(rowFix.rows.find(r=>r.label==='before').maxFootIntrusion),2)} mm 的穿入；修正後，以 **1 mm 容差** 檢查完整鞋面頂點，未出現碰撞旗標。`:'專項報告尚待確認。'}支撐腳、雙手與接觸遮罩維持不變。這不是「所有連續時間與三角面都零穿模」的證明。

手腕專項是八個啞鈴動作的進入／離開，每方向 201 個位置，使用正式 GLB；每姿勢檢查 3,622 個手部皮膚點。角度是手掌前向與前臂的動畫診斷角，不是人體工學或醫療安全門檻。單手划船的支撐手與杯式深蹲的托鈴可保留較大角度，不能說所有手腕都降到相同值。

| 動作 ID | 張手時最大腕角（前 → 後） | 持握時最大腕角（前 → 後） | 修正後手部／實體啞鈴金屬最深值 |
| --- | --- | --- | --- |
${wristRows}

CPU 檢查包括固定骨長、手腳接點、全肢與自身碰撞、全身皮膚每 24 點取樣，啞鈴另檢完整手部與實體金屬。它不替代真人教練審查、全程慢放或實機效能測試；WebGL 截圖、手機與顯示卡結果由各自的報告記錄。

瀏覽器、手機、效能與本輪整合結果另見[本輪驗證摘要](../artifacts/verification-summary-v0.18.json)，以主流程最後產生的報告為準。這份來源備審文件不預填尚未完成的整合測試結果。

## 教練逐項查看

遊戲內「逐段查看動作」工作台目前來源版本為 **${REVIEW_SOURCE_VERSION}**。請每個動作分別看「就位與拿取、運動行程、放回與離開」，再切正面、側面、背面；九格是記錄範圍，空格不能當成通過。用慢放及行程滑桿確認完整路徑，記下方向、百分比、器材設定與看到的問題，截圖後匯出 JSON 或離線 HTML。檔案也可匯出 CSV。

審查時逐項確認：進入與退出的順序、入座／入架支撐、手掌和握把、腳底和踏板、完整行程與軀幹代償、放回後才放手，以及主要／輔助肌群文字。團課還要分別看暖身、主要訓練、緩和、教練與學員是否同步，並確認換段前提醒與節奏。沒有實際審查者、資格與意見時保持「待審」；工作台保存意見，不自動發出專業認證。

| 動作 | 循環來源 | 轉場 | 真人教練 |
| --- | --- | --- | --- |
${checklist}

## 資料授權與出處

- [CMU Graphics Lab](https://mocap.cs.cmu.edu/)／[資料條款](https://mocap.cs.cmu.edu/faqs.php)：資料可改編並整合於遊戲，不能把原始或轉檔資料直接轉售。依官方文字保留 NSF EIA-0196217 與 mocap.cs.cmu.edu 致謝。手指與拇指欄位不是實際捕捉，遊戲手指沿用握持設定。
- [SAME-Limb](https://doi.org/10.57967/hf/9950)：資料 CC BY 4.0。保留作者、資料 DOI 與改編說明。只使用光學下肢／骨盆標記和派生角度；不把代理長度當臨床關節中心，也不冒稱有上肢資料。
- [UI-PRMD 官方封存](https://zenodo.org/records/23104965)／[PDDL 1.0](https://opendatacommons.org/licenses/pddl/1-0/)：作者明文將資料採 PDDL 1.0；此判定來自資料說明，沒有把論文授權套到資料。Vicon 100 Hz，位置為 mm；角度欄位為度與 YXZ Euler，與 Kinect 的欄位／階層不同。引用 Vakanski、Jun、Paul、Baker，DOI [10.3390/data3010002](https://doi.org/10.3390/data3010002)。
- [UCI 彎舉資料](https://doi.org/10.24432/C5WK63)：資料 CC BY 4.0，Velloso 與 Ugulino（2013）。保留來源、選段、去除視窗摘要、感測器角度展開、按時間重採樣與平滑改編說明。作者論文另有自己的授權，沒有混用。

原始檔 hash、來源網址、切段、單位與匯入資格見 \`public/motions/\` 各來源 manifest，以及 [research 來源整理](../artifacts/mocap-v018/research/upperbody-extension-review.md)。目前沒有可直接列為已接入的負重臥推、各滑輪附件、特殊器材或團課真人全身動捕；這些仍需取得相容資料或另行拍攝，再逐動作校正與審查。
`;
mkdirSync('docs',{recursive:true});writeFileSync(docPath,doc);console.log(JSON.stringify({status:coverage.status,counts,inspectionErrors:errors,changedSources,output,docPath}));if(errors.length||changedSources.length)process.exitCode=1;
