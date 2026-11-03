const machine=(id,name,english,number,type,zone,position,primary,secondary,muscleKeys,secondaryMuscleKeys,steps,range,source)=>({
  id,name,english,number,type,motion:type,zone,position,rotation:0,primary,secondary,muscleKeys,secondaryMuscleKeys,
  steps:steps.map(([title,text])=>({title,text})),range,mistakes:['用甩動身體代替器材動作','突然放掉回程','肩頸或手腕刻意扭轉'],source,
});
const assistedSource={label:'Life Fitness｜Assist Dip Chin',url:'https://www.lifefitness.com/en-gb/catalog/strength-training/selectorized/insignia-series-assist-dip-chin'};
export const additionalStations=[
  machine('assisted-pullup','輔助引體向上機','ASSISTED PULL-UP','49','assistedPullup','固定器材區',{x:-14,z:-4},['背闊肌'],['肱二頭肌','肩胛穩定肌群'],['back'],['biceps','shoulders'],[
    ['扶穩再上機','先扶穩兩側握把，踩上踏台，再把膝蓋放到輔助墊上。'],['手肘往下帶','握住上方握把，肩膀離開耳朵，將身體平順拉起，不甩腿。'],['控制下放','緩慢伸展手肘，回到起點；結束時先踩回踏台，再離開器材。'],
  ],{start:'膝蓋靠在輔助墊，手臂向上伸展',end:'身體拉起，手肘向下靠近身側',cue:'輔助配重用來減少需要自行負擔的重量；不要把選到的配重當成拉起的重量。'},assistedSource),
  machine('assisted-dip','輔助雙槓撐體機','ASSISTED DIP','50','assistedDip','固定器材區',{x:-14,z:3},['肱三頭肌','胸大肌'],['三角肌前束','軀幹穩定'],['triceps','chest'],['shoulders','core'],[
    ['扶穩握把','踩上踏台，雙手握穩平行握把，再讓膝蓋靠上輔助墊。'],['屈肘下降','手肘朝後方彎曲，讓身體緩慢下降，只到肩部能控制的位置。'],['平順撐起','向下推握把把身體撐回，不聳肩；離機前先踩回踏台。'],
  ],{start:'雙手撐穩，膝蓋由輔助墊承托',end:'手肘自然彎曲，身體平穩下降',cue:'全程保留肩部控制，不追求下降得越深越好。'},assistedSource),
  machine('hip-abduction','髖外展機','SEATED HIP ABDUCTION','51','hipAbduction','固定器材區',{x:-7.5,z:-7.5},['臀中肌','臀小肌'],['軀幹穩定'],['glutes'],['core'],[
    ['坐穩靠背','背部靠穩椅墊，雙腿放好，讓腿部外側貼住兩側軟墊。'],['向外打開','雙腿平順向外推開，骨盆保持坐穩，不用上身晃動。'],['慢慢收回','控制雙腿回到起點，不讓配重片撞在一起。'],
  ],{start:'腿部外側靠住軟墊',end:'雙腿向兩側打開',cue:'由髖部帶動，膝蓋與腳掌跟著整條腿移動，不用腳踝硬扭。'},{label:'Life Fitness｜Insignia Hip Abduction',url:'https://www.lifefitness.com.au/commercial/hip-abduction-sslc-hab'}),
  machine('hip-adduction','髖內收機','SEATED HIP ADDUCTION','52','hipAdduction','固定器材區',{x:4.5,z:-7.5},['大腿內收肌群'],['軀幹穩定'],['adductors'],['core'],[
    ['坐穩擺腿','靠穩背墊，讓兩腿內側貼住軟墊，起始開度保留舒適範圍。'],['向內合攏','由髖部帶動雙腿向內，骨盆保持坐穩，膝蓋不要刻意扭轉。'],['控制打開','慢慢讓雙腿回到起始開度，配重保持平順。'],
  ],{start:'雙腿自然打開，內側靠墊',end:'雙腿向內靠近',cue:'內收的是整條腿，不靠夾腳踝或左右晃動上身完成。'},{label:'Life Fitness｜Insignia Hip Adduction',url:'https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/insignia-series-hip-adduction'}),
  machine('back-extension','45° 背伸展椅','45 DEGREE BACK EXTENSION','53','backExtension','自由重量區',{x:-27,z:5},['背部豎脊肌'],['臀大肌','腿後側肌群'],['back'],['glutes','hamstrings'],[
    ['踩穩後靠墊','先踩穩踏板，再靠好大腿墊，確認身體平衡後開始。'],['從髖部前傾','背部保持自然，從髖部慢慢往前折，手臂放在腰側。'],['回到身體直線','用可控制的速度回到起點，不把腰部往後頂到過度伸展。'],
  ],{start:'身體與下肢大致連成斜直線',end:'從髖部向前折，上身降低',cue:'軟墊托住大腿上側；活動從髖部發生，回程停在身體自然連線。'},{label:'Life Fitness｜Back Extension Bench',url:'https://shop.lifefitness.com/products/signature-series-back-extension'}),
  machine('preacher-curl','槓片式牧師彎舉機','PLATE LOADED PREACHER CURL','54','preacherCurl','自由重量區',{x:-21,z:5},['肱二頭肌'],['前臂肌群'],['biceps'],['forearms'],[
    ['坐穩靠墊','坐好後讓上臂靠在斜墊上，手腕自然握住握把。'],['彎肘舉起','上臂留在墊上，彎曲手肘帶起機臂，不用肩膀往前頂。'],['慢慢放回','控制手肘伸展回到起點，不讓關節向後頂死。'],
  ],{start:'上臂靠在斜墊，手肘保留微彎',end:'手肘彎曲，握把向上靠近',cue:'斜墊承托上臂，回程保持控制，不讓重量把手肘突然拉直。'},{label:'Life Fitness｜Insignia Biceps Curl（器械變式參考）',url:'https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/insignia-series-biceps-curl'}),
  machine('lying-chest-press','槓片式平躺胸推機','PLATE LOADED LYING CHEST PRESS','55','lyingChestPress','槓片器材區',{x:19.5,z:-7.8},['胸大肌'],['肱三頭肌','三角肌前束'],['chest'],['triceps','shoulders'],[
    ['躺穩椅墊','坐上椅墊後往後躺好，雙腳踩穩，再握住胸側握把。'],['平順推起','背部留在墊上，雙手推動獨立機臂，手腕保持自然。'],['控制回程','慢慢收回到胸側的可控制位置，不讓機臂突然落下。'],
  ],{start:'平躺靠墊，握把在胸側',end:'機臂向上推起，手肘自然伸展',cue:'這是帶獨立機臂與槓片的躺式胸推，不是槓鈴臥推架。'},{label:'Hammer Strength｜Iso-Lateral Bench Press',url:'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-bench-press'}),
  machine('decline-chest-press','槓片式下斜胸推機','PLATE LOADED DECLINE CHEST PRESS','56','declineChestPress','槓片器材區',{x:19.5,z:-.5},['胸大肌'],['肱三頭肌','三角肌前束'],['chest'],['triceps','shoulders'],[
    ['靠穩下斜椅墊','坐好後靠穩下斜背墊，雙腳踩穩，握住兩側握把。'],['推動機臂','保持背部支撐，平順推起機臂，避免用腰部借力。'],['慢慢回到胸側','控制機臂放回肩部能掌握的位置，再開始下一次。'],
  ],{start:'靠穩下斜背墊，握把在胸側',end:'機臂推起，手肘自然伸展',cue:'椅墊角度與推送方向不同於上斜胸推；標色表示參與肌群，沒有量測個別胸部區域的出力。'},{label:'Hammer Strength｜Iso-Lateral Decline Chest Press',url:'https://shop.lifefitness.com/products/hammer-strength-plate-loaded-iso-lateral-decline-chest-press'}),
];

export const reverseFlyActivity={
  id:'machine-reverse-fly',stationId:'pec-deck',name:'蝴蝶機反向飛鳥',english:'PEC DECK REVERSE FLY',runtime:'machine',
  category:'strength',duration:6,side:'both',attachmentId:'reverse-fly-handles',setupLabel:'面向胸墊・反向飛鳥',
  primary:['三角肌後束','上背肌群'],secondary:['肩胛穩定肌群'],muscleKeys:['shoulders','back'],secondaryMuscleKeys:[],
  steps:[{title:'面向胸墊坐穩',text:'把座椅與握把調到對應位置，胸前輕靠軟墊，雙腳踩穩。'},{title:'手臂向兩側打開',text:'手肘保留微彎，平順向兩側打開，肩膀不要聳起。'},{title:'控制向前合回',text:'慢慢送回起點，胸前維持支撐，不用甩腰帶動。'}],
  range:{start:'面向胸墊，雙臂在前方',end:'雙臂向兩側打開',cue:'夾胸與反向飛鳥共用同一訓練站；反向飛鳥要換成面向胸墊的坐姿與握把設定。'},
  mistakes:['聳肩或伸頭迎握把','甩動軀幹借力','回程突然放掉配重'],
  source:{label:'Matrix Taiwan｜蝴蝶夾胸／反向飛鳥使用說明',url:'https://images-direct.jhtassets.com/bcffcda4f10cb26cbe70fe30908df1431ee6e478/original/named/UltraPecFlyRearDelt%2BIntelligentTrainingItc20%2B66306%2B85967%2Bzht%2Btw%2B.pdf'},
};
