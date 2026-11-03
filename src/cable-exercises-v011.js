const exercise=(id,name,attachmentId,primary,muscleKeys,secondary,secondaryMuscleKeys,steps,source,setupLabel,cue)=>({
  id,name,english:id.toUpperCase().replaceAll('-',' '),stationId:'cable-fly',attachmentId,category:'strength',side:'both',duration:7,
  primary,muscleKeys,secondary,secondaryMuscleKeys,setupLabel,steps:steps.map(([title,text])=>({title,text})),
  range:{start:steps[0][1],end:steps[1][1],cue},mistakes:['用身體前後擺動帶起重量','回程太快，讓配重突然落下','手腕折彎或肩膀聳起'],source,
});

export const cableExercisesV011=[
  exercise('cable-rope-hammer-curl','繩索槌式彎舉','triceps-rope',['肱二頭肌、肱肌'],['biceps'],['肱橈肌與前臂握持肌群'],['forearms'],[
    ['握好低位繩索','滑輪放低，雙手掌心相對握住繩索兩端。雙腳踩穩，上臂放在身體兩側。'],
    ['彎肘帶起','上臂留在原位，彎曲手肘把繩索帶向肩前。掌心保持相對，不往後仰。'],
    ['慢慢伸肘','沿原路放回，接近伸直時仍保留控制，不讓配重撞回去。'],
  ],{label:'Gold’s Gym BC｜繩索槌式彎舉',url:'https://goldsgymbc.ca/wp-content/uploads/2023/09/GGBC-4-Day-Machine-Focused.pdf'},'低滑輪・雙頭繩索','只動手肘，肩膀和上臂保持穩定。'),
  exercise('cable-straight-arm-pulldown','直桿直臂下拉','straight-bar',['背闊肌'],['back'],['肱三頭肌長頭與腹部穩定'],['triceps','core'],[
    ['握好高位直桿','面向高滑輪，雙手正握直桿，握距略寬於肩。雙腳踩穩，手肘微彎。'],
    ['手臂往下帶','保持手肘角度，從肩部把直桿帶向大腿前方。腹部收穩，不用腰部後仰。'],
    ['控制抬回','沿弧線慢慢抬回，肩膀只抬到能穩定控制的位置。'],
  ],{label:'Catalyst Athletics｜Straight-arm pulldown',url:'https://www.catalystathletics.com/exercise/907/Straight-Arm-Pulldown/'},'高滑輪・正握直桿','手肘角度保持一致，從肩部帶動手臂，不做成屈肘下拉。'),
  exercise('cable-rope-crunch','站姿繩索捲腹','triceps-rope',['腹直肌'],['core'],['前臂握持與肩部穩定'],['forearms','shoulders'],[
    ['繩索放在耳側','背向高滑輪，雙腳約與髖同寬，膝蓋放鬆。兩手握住繩索，放在耳朵兩側。'],
    ['肋骨往骨盆捲','吐氣，把肋骨往下捲近骨盆。骨盆留在原位，不往後坐，也不用手臂拉繩索。'],
    ['慢慢展回','吸氣並控制上身回正。不要突然挺腰，雙手保持在頭部兩側。'],
  ],{label:'ACE｜Standing crunch',url:'https://www.acefitness.org/resources/everyone/exercise-library/331/standing-crunch/'},'背向高滑輪・雙頭繩索','動的是脊椎的捲曲，避免把動作做成整個上身從髖部折下去。'),
];

export const CABLE_IDS_V011=Object.freeze(cableExercisesV011.map(exercise=>exercise.id));
