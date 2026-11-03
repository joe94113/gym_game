import {coursePlans} from './course-plans.js';
// Timed lesson plans are original game content, not copied branded choreography.
const stageLabels={warmup:'暖身',main:'主要訓練',cooldown:'緩和'};
const steps=items=>items.map(([title,text])=>({title,text}));
const course=(kind,name,english,options)=>{const plan=coursePlans[kind];let elapsed=0;return {
  id:kind==='warmup'?'group-class':`class-${kind}`,movementId:kind==='warmup'?'group-class':`class-${kind}`,
  stationId:'group-class',runtime:kind==='warmup'?'facility':'class',facilityKind:'groupClass',classKind:kind,
  name,english,zone:'團體教室',category:'class',side:'both',level:'入門示範',
  mistakes:['為了跟上節奏而加大動作','動作還沒站穩就急著切換'],...options,
  duration:plan.duration,courseBlocks:plan.blocks.map(item=>{const start=elapsed/plan.duration;elapsed+=item.seconds;return {...item,start,end:elapsed/plan.duration,block:stageLabels[item.stage]};}),
};};

export const groupWarmupActivity=course('warmup','全身活動課','FULL-BODY MOBILITY',{
  attachmentId:'none',equipmentTag:'徒手暖身',setupLabel:'踏步・抬臂・屈膝活動',classFocus:'mobility',
  summary:'先踏步，再活動肩膀、膝蓋與軀幹，最後放慢動作。',
  primary:['肩部活動','腿部活動'],secondary:['軀幹穩定'],muscleKeys:['shoulders','quads'],secondaryMuscleKeys:['core','glutes'],
  steps:steps([['先找到節奏','原地輕踏步，讓手臂自然擺動。'],['逐漸活動關節','跟著抬臂、小幅屈膝與軀幹活動，保持腳步穩定。'],['放慢動作','慢慢放下手臂、站穩，維持自然呼吸。']]),
  range:{start:'原地踏步，雙手自然擺動',end:'站穩並放慢呼吸',cue:'暖身分段進行，不必一開始就抬得很高或蹲得很低。'},
  source:{label:'World Gym｜團體課程介紹（課程形式參考）',url:'https://www.worldgymtaiwan.com/aerobics-class'},
});

export const groupClassActivities=[
  course('dance','有氧舞蹈','AEROBIC DANCE',{
    attachmentId:'none',equipmentTag:'徒手舞步',setupLabel:'踏併步・抬膝・手臂組合',
    summary:'跟著踏併步和抬膝，練習把腳步與手臂接起來。',
    primary:['腿部肌群','臀部肌群'],secondary:['軀幹穩定','肩部協調'],muscleKeys:['quads','glutes','calves'],secondaryMuscleKeys:['core','shoulders'],
    steps:steps([['先看腳步','先跟著踏併步，不急著把手臂加進來。'],['接上手臂','抬膝或踏步時配合抬臂，動作維持在自己的空位內。'],['慢慢收尾','把步幅縮小，回到輕鬆踏步。']]),
    range:{start:'小幅踏併步，手臂自然擺動',end:'踏步放鬆，回到起始節奏',cue:'先跟上腳步，再加入手臂。這段使用原創舞步示範，沒有播放品牌課程編舞。'},
    source:{label:'World Gym｜舞動有氧（課程形式參考）',url:'https://www.worldgymtaiwan.com/aerobics-class/cardio-sculpt/cardio-fat-burning/dance-aerobics'},
  }),
  course('cycle','飛輪課','INDOOR CYCLING',{
    attachmentId:'studio-cycle',equipmentTag:'飛輪車',setupLabel:'坐姿順踩・穩定節奏',
    summary:'坐穩飛輪車，從輕鬆順踩進入主段，再慢慢降速。',
    primary:['股四頭肌','臀部肌群'],secondary:['腿後側肌群','小腿肌群','軀幹穩定'],muscleKeys:['quads','glutes'],secondaryMuscleKeys:['hamstrings','calves','core'],
    steps:steps([['坐穩再踩','上車後踩好踏板，雙手輕扶把手。'],['維持順暢節奏','跟著示範穩定踩踏，肩頸放鬆，骨盆留在坐墊上。'],['先降速再下車','收尾時放慢踏頻，停穩後才移開雙腳並離開。']]),
    range:{start:'坐姿輕鬆順踩',end:'放慢踏頻，回到輕鬆節奏',cue:'這段示範坐姿騎乘。畫面沒有估算你的心率，也沒有替你設定阻力。'},
    source:{label:'World Gym｜飛輪心率課程（課程形式參考）',url:'https://www.worldgymtaiwan.com/aerobics-class/indoor-cycling/indoor-cycling'},
  }),
  course('trx','TRX 懸吊訓練','SUSPENSION TRAINING',{
    attachmentId:'suspension-straps',equipmentTag:'懸吊帶',setupLabel:'低划船・輔助淺蹲',
    summary:'雙腳踩地，用懸吊帶練習划船和輔助淺蹲。',
    primary:['背部肌群','股四頭肌','臀部肌群'],secondary:['肱二頭肌','軀幹穩定'],muscleKeys:['back','quads','glutes'],secondaryMuscleKeys:['biceps','core'],
    steps:steps([['握穩並站好','雙手握住把手，讓帶子保持張力，雙腳踩穩地面。'],['划船與淺蹲','划船時平順彎肘，淺蹲時從髖膝一起降低重心。'],['控制回程','慢慢回到站姿，收好把手再離開。']]),
    range:{start:'握住把手，雙腳踩地',end:'完成划船或淺蹲，再回到站姿',cue:'這段保留雙腳著地。身體角度與站位會影響負荷，實際練習需先熟悉器材設定。'},
    source:{label:'TRX｜Suspension Trainer Quick Start',url:'https://www.trxtraining.com/pages/quickstart-suspension-trainer'},
  }),
  course('barbell','槓鈴肌力訓練','BARBELL STRENGTH',{
    attachmentId:'studio-barbell',equipmentTag:'短槓與槓片',setupLabel:'屈髖準備・硬舉・划船',
    summary:'拿取短槓後，練習屈髖、羅馬尼亞硬舉和划船。',
    primary:['臀部肌群','腿後側肌群','背部肌群'],secondary:['肱二頭肌','前臂肌群','軀幹穩定'],muscleKeys:['glutes','hamstrings','back'],secondaryMuscleKeys:['biceps','forearms','core'],
    steps:steps([['拿穩短槓','站穩再握槓，雙手維持對稱，讓槓留在身體前方。'],['從髖部帶動','硬舉時往後送髖，膝蓋保留微彎；划船時軀幹保持穩定。'],['放回地面','屈髖彎膝，把槓片平穩放回地面，確認放穩後再鬆手。']]),
    range:{start:'雙手握槓，站穩並練習屈髖',end:'完成硬舉或划船後，控制回到起點',cue:'使用場景示意短槓與原創動作組合；重量標示只代表遊戲道具配置。'},
    source:{label:'Les Mills｜BODYPUMP（槓鈴團課形式參考）',url:'https://www.lesmills.com/workouts/bodypump'},
  }),
  course('aerial','空中瑜珈','SUPPORTED AERIAL YOGA',{
    attachmentId:'aerial-hammock',equipmentTag:'承重吊布',setupLabel:'離地坐姿・支撐倒掛・回正落地',classFocus:'mixed',level:'吊布支撐示範',
    summary:'先做站姿暖身，再由吊布承托髖部，練習離地坐姿、緩慢倒掛和回正落地。',
    primary:['軀幹穩定','胸肩活動','腿後側伸展'],secondary:['背部支撐','髖部控制'],muscleKeys:['core','shoulders','hamstrings'],secondaryMuscleKeys:['back','hipFlexors','glutes'],
    steps:steps([['站穩再坐上兜布','先握穩布面，再慢慢把髖部坐入兜布；有支撐後才收腳離地。'],['由吊布支撐身體','坐姿段雙腳離地；倒掛段由髖部兜布支撐，雙手握穩，緩慢轉向並回正。'],['回正並踩穩地面','先回到正坐，再慢慢放下雙腳。站穩後才放開吊布並離開。']]),
    range:{start:'雙腳踩地，握穩吊布並準備上布',end:'完成受支撐坐姿與倒掛，回正落地後再離布',cue:'遊戲示範受支撐的坐姿與倒掛。實際上布及倒掛請由現場教練帶領；標色顯示活動和支撐部位，尚未取得真人教練審核。'},
    source:{label:'Aerial Essentials｜雙點吊布形式與設備參考',url:'https://www.aerialessentials.com/pages/faq'},
  }),
  course('pilates','墊上皮拉提斯','MAT PILATES',{
    attachmentId:'pilates-mat',equipmentTag:'瑜珈墊',setupLabel:'仰躺呼吸・交替抬腳・橋式',
    summary:'在墊上練習呼吸、交替抬腳與小幅橋式。',
    primary:['核心肌群','臀部肌群'],secondary:['腿後側肌群','骨盆穩定'],muscleKeys:['core','glutes'],secondaryMuscleKeys:['hamstrings'],
    steps:steps([['躺穩並呼吸','先坐到墊上再慢慢躺下，彎膝踩地，讓肩頸放鬆。'],['控制抬腳和橋式','一次抬一腳，保持骨盆平穩；橋式只抬到身體可控制的位置。'],['把身體放回墊上','慢慢放下骨盆與雙腳，回到仰躺呼吸，再慢慢坐起。']]),
    range:{start:'仰躺彎膝，雙腳踩穩墊面',end:'完成交替抬腳與小幅橋式，回到仰躺',cue:'示範重點是平順控制與呼吸，不需要把腿抬得更高或把腰拱得更大。'},
    source:{label:'World Gym｜皮拉提斯（課程形式參考）',url:'https://www.worldgymtaiwan.com/aerobics-class/static-stretching/wellness-fitness/pilates'},
  }),
];

export const groupClassDefinitions=[groupWarmupActivity,...groupClassActivities];
export const groupClassByKind=kind=>groupClassDefinitions.find(item=>item.classKind===kind);
export function classBlockAt(activityOrKind,phase=0){
  const activity=typeof activityOrKind==='object'?activityOrKind:groupClassByKind(activityOrKind),blocks=activity?.courseBlocks||[];
  if(!blocks.length)return null;
  const p=Math.max(0,Math.min(1,Number(phase)||0)),index=Math.max(0,blocks.findIndex(item=>p>=item.start&&(p<item.end||item.end===1)));
  return{...blocks[index],index,total:blocks.length,progress:(p-blocks[index].start)/(blocks[index].end-blocks[index].start)};
}
