// Original game lesson plans. The formats and gradual warm-up/cool-down follow
// the official references recorded in docs/course-design.md; no branded
// choreography or professional coaching sign-off is implied.
const segment=(stage,id,seconds,label,motionId,tempoSeconds,intensity,description,extra={})=>({id,stage,seconds,label,description,motionId,tempoSeconds,intensity,transitionSeconds:3,...extra});
const s=segment;
const standingRecovery=(stage,id,seconds,label,motion='recover')=>s(stage,id,seconds,label,motion,8,.08,'縮小動作，站穩並維持自然呼吸。');

const warmup=[
  s('warmup','start-march',50,'輕鬆踏步','march',4,.15,'用小步幅開始，手臂自然擺動。'),
  s('warmup','start-shoulder',50,'肩部活動','shoulder-open',8,.2,'緩慢打開肩膀，再控制放回。'),
  s('warmup','start-side',50,'左右踏步','side-step',4,.25,'左右各踏一步，先把重心移穩。'),
  s('warmup','start-hinge',50,'練習屈髖','hip-hinge',8,.25,'臀部略往後，上身跟著髖部前傾。'),
  s('warmup','start-knee',50,'交替抬膝','knee-lift',5,.3,'交替抬膝，腳放回後再換邊。'),
  s('warmup','start-breath',50,'放慢踏步','march',5,.2,'縮小步幅，準備接上全身活動。'),
  s('main','active-side',50,'側向移動','side-step',3.5,.4,'左右踏步，保持上身平穩。'),
  s('main','active-squat',50,'小幅屈膝','shallow-squat',8,.35,'髖膝一起彎曲，再平順站起。'),
  s('main','active-knee',50,'抬膝與站穩','knee-lift',5,.4,'每次都先站穩，再換另一腳。'),
  s('main','active-hinge',50,'屈髖活動','hip-hinge',8,.4,'從髖部前傾，不用往地面伸手。'),
  s('main','active-shoulder',50,'胸肩開合','shoulder-open',8,.35,'肩部保持放鬆，手臂慢慢開合。'),
  s('main','active-march',50,'全身踏步','march',4,.35,'手腳自然配合，回到輕鬆節奏。'),
  s('cooldown','finish-side',50,'縮小側步','side-step',5,.2,'步幅逐漸縮小，不急著停下。'),
  s('cooldown','finish-shoulder',50,'放鬆肩部','shoulder-open',10,.18,'緩慢活動肩膀，不刻意抬高。'),
  s('cooldown','finish-hinge',50,'輕柔屈髖','hip-hinge',10,.15,'用小幅度前傾，再慢慢站回。'),
  s('cooldown','finish-march',50,'慢慢踏步','march',6,.12,'放慢腳步，讓手臂自然擺動。'),
  s('cooldown','finish-stand',50,'站穩與呼吸','breathe',8,.05,'雙腳踩穩，維持自然呼吸。'),
  s('cooldown','finish-breathe',50,'結束前放鬆','breathe',10,0,'回到輕鬆站姿，準備結束課程。'),
];

const dance=[
  s('warmup','dance-start-march',75,'踏步找節奏','march',4,.18,'先用小步幅熟悉左右重心。'),
  s('warmup','dance-start-touch',75,'踏併步練習','step-touch',4,.25,'先看腳步，再讓手臂自然加入。'),
  s('warmup','dance-start-reach',75,'側步與伸手','side-reach',5,.3,'手臂朝側邊伸出，步幅保持輕鬆。'),
  s('warmup','dance-start-knee',75,'小幅抬膝','knee-lift',5,.35,'抬膝後踩穩，再換另一邊。'),
  ...[['step-touch','v-step','knee-lift','arm-combo'],['step-touch','hamstring-curl','side-reach','arm-combo'],['v-step','knee-lift','hamstring-curl','arm-combo']].flatMap((moves,round)=>[
    ...moves.map((motion,index)=>s('main',`dance-${round+1}-${index+1}`,80,`第 ${round+1} 輪・${{'step-touch':'踏併步','v-step':'V 字踏步','knee-lift':'交替抬膝','hamstring-curl':'腿後勾腳','side-reach':'側步伸手','arm-combo':'手腳組合'}[motion]}`,motion,3.6-round*.3,.4+round*.08,'左右都做，腳步穩定後再加入手臂。')),
    standingRecovery('main',`dance-${round+1}-recover`,80,`第 ${round+1} 輪・恢復踏步`),
  ]),
  standingRecovery('cooldown','dance-finish-recover',75,'慢慢縮小舞步'),
  s('cooldown','dance-finish-touch',75,'輕鬆踏併步','step-touch',5,.18,'步幅縮小，手臂放低。'),
  s('cooldown','dance-finish-reach',75,'輕柔側伸','side-reach',8,.12,'左右輕柔伸展，維持自然呼吸。'),
  s('cooldown','dance-finish-march',75,'放慢踏步','march',6,.06,'慢慢回到輕鬆站姿，準備結束。'),
];

const cycling=(stage,id,seconds,label,motion,rpm,intensity,description)=>s(stage,id,seconds,label,motion,60/rpm,intensity,description,{cadenceRPM:rpm});
const cycle=[
  cycling('warmup','cycle-start-easy',75,'坐穩輕踩','cycle-easy',60,.15,'坐穩並踩好踏板，先以輕鬆節奏開始。'),
  cycling('warmup','cycle-start-66',75,'逐漸接上節奏','cycle-easy',66,.2,'肩頸保持放鬆，持續平順踩踏。'),
  cycling('warmup','cycle-start-72',75,'坐姿順踩','cycle-steady',72,.25,'維持坐姿，讓左右腳連續帶動踏板。'),
  cycling('warmup','cycle-start-76',75,'準備主段','cycle-steady',76,.3,'穩定節奏後，再接上踏頻變化。'),
  ...[0,1,2].flatMap(round=>[
    cycling('main',`cycle-${round+1}-steady`,80,`第 ${round+1} 輪・穩定踩踏`,'cycle-steady',78+round*2,.4,'坐墊支撐骨盆，雙手輕扶把手。'),
    cycling('main',`cycle-${round+1}-cadence-a`,80,`第 ${round+1} 輪・踏頻段 A`,'cycle-cadence',84+round*2,.52,'用平順踩踏接上較快節奏，不左右晃動。'),
    cycling('main',`cycle-${round+1}-recovery-a`,80,`第 ${round+1} 輪・恢復輕踩`,'cycle-recovery',64,.18,'維持踩踏，讓節奏慢下來。'),
    cycling('main',`cycle-${round+1}-cadence-b`,80,`第 ${round+1} 輪・踏頻段 B`,'cycle-cadence',86+round*2,.55,'全程坐姿，保持踩踏與上身穩定。'),
    cycling('main',`cycle-${round+1}-recovery-b`,80,`第 ${round+1} 輪・收回節奏`,'cycle-recovery',64,.15,'回到輕鬆節奏，再準備下一輪。'),
  ]),
  ...[66,64,62,60].map((rpm,index)=>cycling('cooldown',`cycle-finish-${index+1}`,75,index===3?'結束前輕踩':'逐漸放慢踩踏','cycle-recovery',rpm,.12-index*.025,'持續輕踩，不突然停腳；結束後先停穩再下車。')),
];

const trx=[
  s('warmup','trx-start-grip',100,'站穩與握帶','trx-recovery',10,.1,'握穩把手，雙腳踩地，熟悉帶子的張力。'),
  s('warmup','trx-start-row',100,'小幅划船','trx-low-row',10,.2,'以小幅度彎肘，再慢慢伸回。'),
  s('warmup','trx-start-squat',100,'淺蹲練習','trx-shallow-squat',10,.25,'髖膝一起彎曲，雙腳保持踩穩。'),
  ...[0,1,2].flatMap(round=>[
    s('main',`trx-${round+1}-row`,90,`第 ${round+1} 輪・低划船`,'trx-low-row',6,.4+round*.05,'約 15 趟，平順彎肘再控制回程。'),
    s('main',`trx-${round+1}-rest-a`,30,`第 ${round+1} 輪・站穩調整`,'trx-recovery',8,.08,'回到站姿，握帶並自然呼吸。'),
    s('main',`trx-${round+1}-squat`,90,`第 ${round+1} 輪・輔助淺蹲`,'trx-shallow-squat',6,.4+round*.05,'約 15 趟，雙腳踩穩，再平順站起。'),
    s('main',`trx-${round+1}-alternate`,90,`第 ${round+1} 輪・交替划船`,'trx-alternating-row',9,.4,'左右各做一次為一趟，兩手始終握住把手。'),
    s('main',`trx-${round+1}-hold`,20,`第 ${round+1} 輪・短停留`,round===1?'trx-squat-hold':'trx-row-hold',20,.3,'停留 20 秒，雙腳保持支撐，不憋氣。'),
    s('main',`trx-${round+1}-rest-b`,80,`第 ${round+1} 輪・恢復`,'trx-recovery',10,.05,'站直並調整呼吸，準備下一段。'),
  ]),
  s('cooldown','trx-finish-row',100,'放慢划船回程','trx-low-row',12,.15,'縮小幅度，慢慢伸回手臂。'),
  s('cooldown','trx-finish-squat',100,'輕柔屈膝活動','trx-shallow-squat',12,.12,'只做小幅度屈膝，動作逐漸放慢。'),
  s('cooldown','trx-finish-breath',100,'站穩與呼吸','trx-recovery',10,0,'回到站姿，結束後再放開把手。'),
];

const barbell=[
  s('warmup','barbell-start-hinge',100,'握槓與屈髖準備','hinge-prep',10,.15,'先站穩握槓，以小幅度熟悉屈髖。'),
  s('warmup','barbell-start-deadlift',100,'淺幅硬舉練習','shallow-deadlift',10,.2,'膝蓋保留彎曲，槓靠近身體。'),
  s('warmup','barbell-start-rest',100,'放槓與調整呼吸','put-down-rest',10,0,'屈髖彎膝，把槓片放穩後鬆手；下一段前再握好拿起。'),
  ...[0,1,2].flatMap(round=>[
    s('main',`barbell-${round+1}-deadlift`,90,`第 ${round+1} 輪・${round===1?'淺幅硬舉':'羅馬尼亞硬舉'}`,round===1?'shallow-deadlift':'romanian-deadlift',9,.4,'約 10 趟，從髖部帶動，保持槓在身體前方。'),
    s('main',`barbell-${round+1}-rest-a`,30,`第 ${round+1} 輪・放槓休息`,'put-down-rest',10,0,'把槓片放穩再鬆手，恢復呼吸後重新握槓。'),
    s('main',`barbell-${round+1}-row`,90,`第 ${round+1} 輪・屈髖划船`,'bent-row',9,.4,'約 10 趟，軀幹保持穩定，不用甩動槓鈴。'),
    s('main',`barbell-${round+1}-rest-b`,30,`第 ${round+1} 輪・放槓調整`,'put-down-rest',10,0,'放穩短槓並調整呼吸，再準備下一組。'),
    s('main',`barbell-${round+1}-curl`,90,`第 ${round+1} 輪・站姿彎舉`,'biceps-curl',9,.35,'約 10 趟，上臂留在身旁，控制彎肘與回程。'),
    s('main',`barbell-${round+1}-rest-c`,70,`第 ${round+1} 輪・放槓恢復`,'put-down-rest',10,0,'短槓放回地面後休息，下一段前再拿起。'),
  ]),
  s('cooldown','barbell-finish-hinge',60,'放慢屈髖','hinge-prep',12,.1,'縮小幅度，慢慢回到站姿。'),
  s('cooldown','barbell-finish-rest',210,'放槓與放鬆','put-down-rest',12,0,'把槓放穩，空手調整呼吸；結束前再依提示握槓。'),
  s('cooldown','barbell-finish-ready',30,'站穩並準備收器材','hold-rest',10,0,'持槓站穩，結束後依離場動作把短槓收好。'),
];

const aerial=[
  s('warmup','aerial-start-grip',100,'握布與站穩','aerial-recovery',10,.1,'雙腳踩地，雙手先握穩低位吊布。'),
  s('warmup','aerial-start-reach',100,'輕柔胸肩活動','aerial-standing-reach',10,.2,'借助布面支撐，緩慢活動胸肩。'),
  s('warmup','aerial-start-hinge',100,'小幅屈髖','aerial-assisted-hinge',12,.25,'從髖部前傾，再平順回到站姿。'),
  ...[0,1,2].flatMap(round=>[
    s('main',`aerial-${round+1}-hinge`,120,`第 ${round+1} 輪・吊布離地坐姿`,'aerial-supported-seat',120,.4,'坐到兜布後再慢慢收腳，讓吊布支撐髖部；最後先踩穩雙腳再離布。',{repetitions:1,activationKind:'support'}),
    s('main',`aerial-${round+1}-left`,20,`第 ${round+1} 輪・左側舒展`,'aerial-side-left',20,.35,'小幅側向舒展 20 秒，再回到中央。'),
    s('main',`aerial-${round+1}-right`,20,`第 ${round+1} 輪・右側舒展`,'aerial-side-right',20,.35,'換邊舒展 20 秒，重心保持在雙腳上。'),
    s('main',`aerial-${round+1}-reach`,120,`第 ${round+1} 輪・吊布支撐倒掛與回正`,'aerial-supported-inversion',120,.35,'先由兜布承托髖部，再緩慢倒掛。回正後才放下雙腳，站穩再離布。',{repetitions:1,activationKind:'support'}),
    s('main',`aerial-${round+1}-hold`,20,`第 ${round+1} 輪・短暫屈髖停留`,'aerial-hinge-hold',20,.3,'停留 20 秒，保持自然呼吸。'),
    s('main',`aerial-${round+1}-rest`,100,`第 ${round+1} 輪・回正與恢復`,'aerial-recovery',10,.05,'站回中央，握布並調整呼吸。'),
  ]),
  s('cooldown','aerial-finish-reach',100,'放慢胸肩活動','aerial-standing-reach',12,.15,'用小幅度慢慢放鬆肩部。'),
  s('cooldown','aerial-finish-hinge',100,'輕柔屈髖與回正','aerial-assisted-hinge',14,.1,'平順前傾與回正，雙腳保持支撐。'),
  s('cooldown','aerial-finish-breath',100,'站穩與呼吸','aerial-recovery',10,0,'回到站姿，結束後再放開吊布。'),
];

const pilates=[
  s('warmup','pilates-start-breathe',75,'仰躺呼吸','breathe',10,.1,'彎膝踩地，肩頸放鬆並維持自然呼吸。'),
  s('warmup','pilates-start-pelvis',75,'骨盆小幅活動','pelvic-control',10,.2,'以小幅度熟悉骨盆控制。'),
  s('warmup','pilates-start-slide',75,'腳跟滑動練習','heel-slide',12,.2,'一次滑動一腳，慢慢收回後再換邊。'),
  s('warmup','pilates-start-reset',75,'回正與呼吸','breathe',10,.1,'雙腳踩穩，讓骨盆回到自然位置。'),
  ...[0,1,2].flatMap(round=>[
    s('main',`pilates-${round+1}-tap`,80,`第 ${round+1} 輪・交替抬腳`,'toe-tap',10,.35,'左右各一次為一趟，放回後再換腳。'),
    s('main',`pilates-${round+1}-slide`,80,`第 ${round+1} 輪・腳跟滑動`,'heel-slide',10,.35,'腳跟緩慢滑出與收回，保持骨盆平穩。'),
    s('main',`pilates-${round+1}-open`,80,`第 ${round+1} 輪・單側開膝`,'knee-open',10,.3,'一側膝蓋小幅向外，再收回換邊。'),
    s('main',`pilates-${round+1}-bridge`,80,`第 ${round+1} 輪・小幅橋式`,'bridge',10,.35,'平順抬起骨盆，再慢慢放回墊上。'),
    s('main',`pilates-${round+1}-rest`,80,`第 ${round+1} 輪・仰躺恢復`,'rest',10,0,'骨盆與雙腳放回，讓呼吸慢下來。'),
  ]),
  s('cooldown','pilates-finish-pelvis',75,'輕柔骨盆活動','pelvic-control',12,.12,'小幅活動後回到自然位置。'),
  s('cooldown','pilates-finish-knee',75,'放慢開膝活動','knee-open',12,.1,'左右小幅活動，不刻意壓低膝蓋。'),
  s('cooldown','pilates-finish-breathe',75,'放鬆與呼吸','breathe',12,.05,'肩膀放鬆，保持平順呼吸。'),
  s('cooldown','pilates-finish-rest',75,'回到墊上休息','rest',12,0,'回到仰躺姿勢，結束後再慢慢坐起。'),
];

function muscles(kind,block){
  const id=block.motionId;if(/rest|recovery|breathe|recover/.test(id))return [[],[]];
  if(kind==='cycle')return [['quads','glutes'],['hamstrings','calves','core']];
  if(kind==='trx')return id.includes('squat')?[['quads','glutes'],['core']]:[['back'],['biceps','core']];
  if(kind==='aerial')return id==='aerial-supported-seat'?[['core','hipFlexors'],['shoulders','back']]:id==='aerial-supported-inversion'?[['core','glutes'],['shoulders','back','hipFlexors']]:id.includes('hinge')?[['hamstrings','back'],['core']]:id.includes('side')?[['core','shoulders'],['back']]:[['chest','shoulders'],['back']];
  if(kind==='barbell')return id.includes('curl')?[['biceps'],['forearms','core']]:id.includes('row')?[['back'],['biceps','core']]:[['glutes','hamstrings'],['back','core']];
  if(kind==='pilates')return id==='bridge'?[['glutes'],['hamstrings','core']]:id==='knee-open'?[['core','glutes'],['hipFlexors']]:[['core'],['hipFlexors']];
  if(kind==='dance')return [['quads','glutes','calves'],['core','shoulders']];
  return id==='shoulder-open'?[['shoulders','chest'],['core']]:id==='hip-hinge'?[['glutes','hamstrings'],['core','back']]:[['quads','glutes'],['calves','core']];
}
const plan=(kind,duration,blocks)=>({duration,blocks:blocks.map(block=>{const [primaryMuscles,secondaryMuscles]=muscles(kind,block);return {...block,...(kind==='aerial'?{activationKind:block.activationKind||'mobility'}:{}),primaryMuscles,secondaryMuscles};})});
export const coursePlans={warmup:plan('warmup',900,warmup),dance:plan('dance',1800,dance),cycle:plan('cycle',1800,cycle),trx:plan('trx',1800,trx),barbell:plan('barbell',1800,barbell),aerial:plan('aerial',1800,aerial),pilates:plan('pilates',1800,pilates)};
