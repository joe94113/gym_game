import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Run sequentially with the other browser reviews. This script is not a
// second animation implementation: every panel samples the actual runtime.
const folder='artifacts/ergonomics-review';mkdirSync(folder,{recursive:true});
const checked=['src/equipment.js','src/barbell-lifecycle-paths.js','src/machine-lifecycle.js','src/skinned-character.js','src/hand-contact-frame.js','src/pose-review.js'];
const hashes=()=>Object.fromEntries(checked.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const sourceHashes=hashes(),requested=process.argv.slice(2),ids=['machine-squat-rack','machine-smith-squat'].filter(id=>!requested.length||requested.includes(id));
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:.5}),errors=[],reports=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await page.waitForTimeout(150);
  for(const id of ids){
    const result=await page.evaluate(async id=>{
      const a=window.__FORM__,w=a.world;a.openExercise(id);
      if(!w.advanceUntilReady(180,false))throw new Error(`Cannot start ${id}`);
      w.setAnimationPaused(true);
      const metadata=w.getLifecycleMetadata(),smith=id.includes('smith'),stages=metadata.stages;
      const at=(label,q=1)=>{let elapsed=0;for(const stage of stages){if(stage.label===label)return(elapsed+stage.duration*q)/metadata.entryDuration;elapsed+=stage.duration;}throw new Error(`Missing authored stage: ${label}`);};
      const keyPoints=[
        {label:'架外',phase:0},
        {label:'雙手閉握',phase:at('閉握固定槓鈴')},
        {label:'先屈膝降低重心',phase:at('先屈膝降低重心')},
        {label:'頭部低於槓身',phase:at('屈髖低頭讓頭部通過槓下',.5)},
        {label:'低位交替踏入',phase:at('低頭跨入槓下',.5)},
        {label:'上背就位',phase:at('上背靠妥槓身')},
        {label:'雙腳承重站位',phase:at('雙腳移到承重位置')},
        {label:'伸腿抬離承托',phase:at(smith?'伸腿抬槓離開承重銷':'伸腿抬槓離開掛鉤')},
        {label:smith?'轉開掛鉤':'交替小步後退',phase:at(smith?'轉動槓身使掛鉤避開承重銷':'交替小步退到訓練位置',.5)},
        {label:'站穩準備深蹲',phase:1},
      ];
      const sheets=[],closeups=[];
      for(const direction of ['enter','exit']){
        const points=direction==='enter'?keyPoints:keyPoints.toReversed().map(p=>({...p,phase:1-p.phase}));
        for(let part=0;part<2;part++){
          const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=1050;const c=canvas.getContext('2d');
          c.fillStyle='#edf0e9';c.fillRect(0,0,1500,1050);c.fillStyle='#263b30';c.font='23px sans-serif';c.fillText(`${id} / ${direction} / key points ${part*5+1}–${part*5+5}`,16,30);
          const panels=[];
          for(let row=0;row<3;row++)for(let col=0;col<5;col++){
            const p=points[part*5+col],view=['front','side','back'][row],inspected=w.inspectLifecycle(direction,p.phase);
            if(!inspected)throw new Error(`Cannot inspect ${id} ${direction}`);
            const d=w.getContactDiagnostics(),self=w.getSelfClearanceDiagnostics(),snap=w.capturePoseReview(view,300),image=new Image();image.src=snap.image;await image.decode();
            c.drawImage(image,col*300,45+row*330,300,300);c.fillStyle='#263b30';c.font='12px sans-serif';c.fillText(`${view}  ${p.phase.toFixed(5)}  ${p.label}`,col*300+7,361+row*330);
            panels.push({view,u:p.phase,keyPoint:p.label,stage:inspected.frame.stage,barSupport:inspected.frame.barSupport,contacts:inspected.frame.contacts,reach:d.maxReachError,collisions:inspected.clearance.collisions,self:self.collisions});
          }
          sheets.push({direction,part:part+1,panels,image:canvas.toDataURL('image/png')});
        }
      }
      if(smith){
        for(const [label,phase]of [['supported',at('雙腳移到承重位置')],['rotating',at('轉動槓身使掛鉤避開承重銷',.5)],['unhooked',1]]){
          w.inspectLifecycle('enter',phase);
          // An actual isolated wrist-side view includes the neighbouring
          // hook/peg assembly. It may occlude or crop parts of that assembly.
          const snap=w.capturePoseReview('right-hand-side',760);
          closeups.push({label,u:phase,view:'right-hand-side',image:snap.image});
        }
      }
      w.seekExercise(0);w.stopExercise();if(!w.advanceUntilIdle(180,false))throw new Error(`Cannot leave ${id}`);
      return{id,metadata,keyPoints,sheets,closeups};
    },id);
    for(const sheet of result.sheets){sheet.file=`${id}-${sheet.direction}-${sheet.part}.png`;writeFileSync(`${folder}/${sheet.file}`,Buffer.from(sheet.image.split(',')[1],'base64'));delete sheet.image;}
    for(const closeup of result.closeups){closeup.file=`${id}-hook-${closeup.label}.png`;writeFileSync(`${folder}/${closeup.file}`,Buffer.from(closeup.image.split(',')[1],'base64'));delete closeup.image;}
    reports.push(result);console.log(JSON.stringify({id,sheets:result.sheets.length,panels:result.sheets.reduce((sum,s)=>sum+s.panels.length,0),closeups:result.closeups.length}));
  }
  const finalHashes=hashes(),changedSources=checked.filter(p=>sourceHashes[p]!==finalHashes[p]),pass=!errors.length&&!changedSources.length&&reports.every(r=>r.sheets.every(s=>s.panels.every(p=>p.reach<.001&&!p.collisions.length&&!p.self.length)));
  writeFileSync(`${folder}/capture-report.json`,JSON.stringify({pass,sourceHashes,changedSources,errors,scope:'Actual runtime lifecycle samples and isolated true-skinned-character plus actual machine meshes; 10 key points per direction, front/side/back split into two five-column sheets. Static screenshots are not coach approval or continuous-video review. Smith hook context uses the actual isolated wrist-side camera and may be partly occluded.',reports},null,2));
  if(!pass)process.exitCode=1;
}finally{await browser.close();}
