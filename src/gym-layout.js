// One plan drives the room, walking bounds, floor height and map.
export const stationPositions = {
  'chest-press': {x:-5,z:-4}, 'lat-pulldown': {x:-5,z:-11},
  'seated-row': {x:2,z:-11}, 'leg-press': {x:15,z:-11},
  'leg-extension': {x:7,z:3}, 'shoulder-press': {x:2,z:-4},
  'cable-fly': {x:-12,z:-10}, 'squat-rack': {x:-29,z:-10},
  'bench-press': {x:-29,z:-2}, 'dumbbell-curl': {x:-20,z:-1},
  treadmill: {x:-25,z:-20}, bike: {x:-10,z:-20},
  'plate-incline-press': {x:24,z:-11}, 'plate-high-row': {x:15,z:-4},
  'plate-shoulder-press': {x:24,z:-4}, 'hack-squat': {x:15,z:3},
  'hip-thrust': {x:22,z:3}, 'calf-raise': {x:8,z:-11},
  'smith-squat': {x:-21,z:-10}, 'leg-curl': {x:-5,z:3},
  'pec-deck': {x:2,z:3}, 'lateral-raise': {x:7,z:-4},
  elliptical: {x:5,z:-20}, rower: {x:20,z:-20},
  'stretch-zone': {x:-24,z:13},
  'treadmill-2':{x:-30,z:-25},'treadmill-3':{x:-20,z:-25},'treadmill-4':{x:-10,z:-25},
  'bike-2':{x:0,z:-25},'bike-3':{x:10,z:-25},'stair-climber':{x:20,z:-25},
  'bike-4':{x:-32,z:-20},'stair-climber-2':{x:26,z:-20},
  'treadmill-5':{x:-30,z:-15},'treadmill-6':{x:-20,z:-15},
  'bike-5':{x:-10,z:-15},'bike-6':{x:0,z:-15},'elliptical-2':{x:10,z:-15},'stair-climber-3':{x:20,z:-15},
  'assisted-pullup':{x:-14,z:-4},'assisted-dip':{x:-14,z:3},
  'hip-abduction':{x:-7.5,z:-7.5},'hip-adduction':{x:4.5,z:-7.5},
  'back-extension':{x:-27,z:5},'preacher-curl':{x:-21,z:5},
  'lying-chest-press':{x:19.5,z:-7.8},'decline-chest-press':{x:19.5,z:-.5},
};

export const gymLayout = {
  bounds: {minX:-36,maxX:28,minZ:-29,maxZ:32},
  spawn: {x:1,z:21},
  zones: [
    {id:'cardio',name:'有氧訓練區',x:-35,z:-28,w:62,d:15,color:'#cad8d9'},
    {id:'free-weight',name:'自由重量區',x:-35,z:-13,w:25,d:20,color:'#d6c7b1'},
    {id:'selectorized',name:'固定器材區',x:-8,z:-13,w:17,d:20,color:'#d3ddd1'},
    {id:'plate-loaded',name:'槓片器材區',x:11,z:-13,w:16,d:20,color:'#cdc5b8'},
    {id:'mobility',name:'草皮與伸展區',x:-35,z:9,w:23,d:10,color:'#bdcd94'},
    {id:'reception',name:'櫃台與休息區',x:-9,z:10,w:18,d:13,color:'#dfd5c1'},
    {id:'recovery',name:'更衣・淋浴・三溫暖',x:11,z:8,w:17,d:16,color:'#c7dadd'},
    {id:'classroom',name:'團體教室',x:-35,z:21,w:22,d:10,color:'#b6c3c9'},
  ],
  stationPositions,
  staticMats: [{x:-32,z:13},{x:-28,z:13},{x:-20,z:13},{x:-16,z:13}],
  classMats:[{x:-29,z:26.8},{x:-24,z:26.8},{x:-19,z:26.8},{x:-29,z:29.6},{x:-24,z:29.6},{x:-19,z:29.6}],
};

export const GYM_LAYOUT = gymLayout;
export function floorHeightAt(x,z) {
  if(x>=-35&&x<=-13&&z>=21&&z<=31){
    if(x>=-31&&x<=-17&&z>=21.7&&z<=25.3)return .27;
    for(const mat of gymLayout.classMats)if(Math.abs(x-mat.x)<.85&&Math.abs(z-mat.z)<1.3)return .056;
    return .05;
  }
  if(x>=-12.8&&x<=-10.8&&z>=20&&z<=31)return .035;
  if(z<=-13)return .035;
  if(x>=11&&x<=28&&z>=8&&z<=24)return .08;
  if(x>=-35&&x<=-12&&z>=9&&z<=19){
    for(const mat of gymLayout.staticMats)if(Math.abs(x-mat.x)<.82&&Math.abs(z-mat.z)<1.35)return .125;
    return .06;
  }
  if(x>=-9&&x<=9&&z>=10&&z<=23)return .05;
  if(x>=-35&&x<=27&&z>7.3&&z<8.7)return .036;
  if((Math.abs(x+9)<.7||Math.abs(x-10)<.7)&&z>-15)return .035;
  if(x>=-35&&x<=-10&&z>=-13&&z<=7)return .028;
  if(((x>=-8&&x<=9)||(x>=11&&x<=27))&&z>=-13&&z<=7)return .026;
  return .012;
}
export const floorHeight = floorHeightAt;
export function zoneAt(x,z) {
  const found=gymLayout.zones.find(zone=>x>=zone.x&&x<=zone.x+zone.w&&z>=zone.z&&z<=zone.z+zone.d);
  return found?.name || '中央走道';
}

const facility = (id,name,english,number,facilityKind,position,interaction,setup,steps) => ({
  id,name,english,number,type:'facility',motion:'facility',zone:'更衣・淋浴・三溫暖',
  position,interaction,setup,rotation:setup.rotation||0,facilityKind,
  primary:[],secondary:[],muscleKeys:[],secondaryMuscleKeys:[],category:'recovery',
  equipmentTag:'休息設施',plateLoaded:false,steps,
  range:{start:'走近後按 E 使用',end:'按「離開設施」回到走道',cue:'這是場景互動示意，沒有設定個人的水溫、使用時間或療效。'},
  mistakes:[],
});

export const facilityStations = [
  facility('sauna','乾式烤箱','DRY SAUNA','26','sauna',{x:19.2,z:22.1},[14.4,.08,22.1],
    {origin:[19.2,.08,22.8],rotation:Math.PI,cameraYaw:.85,cameraPitch:.46,cameraDistance:3.8,cameraTargetHeight:1.05},
    [{title:'進入烤箱',text:'按 E 開門，人物會坐到木椅上。'},{title:'看看設備',text:'裡面有分層木椅和電熱爐。'},{title:'回到走道',text:'按「離開設施」回到更衣室走道。'}]),
  facility('steam-room','蒸氣室','STEAM ROOM','27','steam',{x:19.2,z:18.5},[14.4,.08,18.5],
    {origin:[19.2,.08,19.2],rotation:Math.PI,cameraYaw:.85,cameraPitch:.46,cameraDistance:3.8,cameraTargetHeight:1.05},
    [{title:'進入蒸氣室',text:'按 E 開門，人物會坐到磁磚長椅上。'},{title:'查看蒸氣',text:'使用時會看到蒸氣從牆邊緩慢升起。'},{title:'結束使用',text:'按「離開設施」回到更衣室走道。'}]),
  facility('cold-plunge','冷水池','COLD PLUNGE','28','coldPlunge',{x:19.2,z:14.9},[14.4,.08,14.9],
    {origin:[19.2,.08,15],rotation:Math.PI,cameraYaw:.85,cameraPitch:.55,cameraDistance:4,cameraTargetHeight:.85},
    [{title:'走進池邊',text:'按 E 使用，人物會坐到池內的階梯上。'},{title:'查看水面',text:'池內的水波會隨使用狀態變化。'},{title:'離開池區',text:'按「離開設施」回到走道。'}]),
  facility('shower-1','獨立淋浴間 A','PRIVATE SHOWER A','29','shower',{x:25.7,z:16},[22.85,.08,16],
    {origin:[26.3,.08,16],rotation:-Math.PI/2,cameraYaw:0,cameraPitch:.5,cameraDistance:3.8,cameraTargetHeight:1.15},
    [{title:'打開隔間',text:'按 E 進入，隔間門會關上。'},{title:'開啟蓮蓬頭',text:'畫面會出現水流。人物保留運動服，方便在遊戲裡查看設備。'},{title:'關水離開',text:'按「離開設施」，水流會停止、隔間門打開。'}]),
  facility('shower-2','獨立淋浴間 B','PRIVATE SHOWER B','30','shower',{x:25.7,z:21},[22.85,.08,21],
    {origin:[26.3,.08,21],rotation:-Math.PI/2,cameraYaw:0,cameraPitch:.5,cameraDistance:3.8,cameraTargetHeight:1.15},
    [{title:'進入隔間',text:'每間淋浴間都有自己的門、蓮蓬頭和置物架。'},{title:'開啟水流',text:'使用時會出現水流，門保持關閉。'},{title:'關水離開',text:'按「離開設施」關水並回到走道。'}]),
  facility('toilet-1','廁所隔間 A','TOILET CUBICLE A','31','toilet',{x:20,z:10.1},[20,.08,12.55],
    {origin:[20,.08,9.7],rotation:0,cameraYaw:.7,cameraPitch:.42,cameraDistance:3.5,cameraTargetHeight:1.05},
    [{title:'打開隔間',text:'按 E 開門，查看獨立廁所隔間。'},{title:'隔間設備',text:'裡面有馬桶、衛生紙和門鎖；人物會坐在闔上的蓋板上。'},{title:'回到走道',text:'按「離開設施」回到更衣室走道。'}]),
  facility('toilet-2','廁所隔間 B','TOILET CUBICLE B','32','toilet',{x:25,z:10.1},[25,.08,12.55],
    {origin:[25,.08,9.7],rotation:0,cameraYaw:.7,cameraPitch:.42,cameraDistance:3.5,cameraTargetHeight:1.05},
    [{title:'進入隔間',text:'按 E 開門，人物會坐在闔上的蓋板上。'},{title:'查看空間',text:'隔牆與門把兩間廁所分開，外面另有洗手台。'},{title:'離開隔間',text:'按「離開設施」回到走道。'}]),
  {...facility('inbody','InBody 體組成分析','BODY COMPOSITION DEMO','33','inbody',{x:7.3,z:20.7},[7.3,.05,22.4],
    {origin:[7.3,.05,20.7],rotation:Math.PI,cameraYaw:.6-Math.PI,cameraPitch:.42,cameraDistance:3.8,cameraTargetHeight:1.15},
    [{title:'站上量測台',text:'畫面示範站穩與握持。真實量測需先脫鞋襪，依現場指示接觸腳底及手部電極。'},{title:'查看示範',text:'螢幕會顯示掃描進度；這裡使用遊戲示意資料。'},{title:'結束量測',text:'按「離開設施」回到櫃台旁。'}]),
    zone:'櫃台與休息區',category:'assessment',equipmentTag:'體組成分析',source:{label:'InBody｜原廠測試準備與流程',url:'https://inbodyusa.com/general/inbody-test/'},range:{start:'站穩電極平台，兩手握好握把',end:'螢幕完成示範掃描',cue:'這是遊戲互動，沒有讀取或量測你的身體資料。'}},
  {...facility('group-class','團體暖身課','GROUP MOVEMENT CLASS','34','groupClass',{x:-24,z:26.8},[-11.8,.035,26.8],
    {origin:[-24,.056,26.8],rotation:Math.PI,cameraYaw:Math.PI,cameraPitch:.55,cameraDistance:10,cameraTargetHeight:1.1},
    [{title:'加入課程',text:'在教室入口按 E，人物會到空墊上跟著活動。'},{title:'跟著教練',text:'一起練習緩慢抬臂、輕微屈膝和上背轉動。'},{title:'離開教室',text:'按「離開設施」回到教室入口。'}]),
    zone:'團體教室',category:'class',equipmentTag:'團體課程',duration:10,primary:['肩部活動'],secondary:['軀幹穩定','斜方肌與上背協調'],muscleKeys:['shoulders'],secondaryMuscleKeys:['core','back'],range:{start:'雙腳站穩，肩頸放鬆',end:'緩慢抬臂，再回到起點',cue:'跟著示範保持平順，不需要追求抬得更高或蹲得更深。'}},
];
