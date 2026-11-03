import {gymLayout} from './gym-layout.js';
import {measurementCanvasKey} from './canvas-updates-v012.js';
import {publicAssetUrl} from './asset-url.js';

// Fictional staff roster. Atlas cells are original generated portraits, not
// photographs or names belonging to an actual club's employees.
export const coachRoster=[
  ['林子安','基礎肌力'],['王柏翰','自由重量'],['張宇辰','槓鈴訓練'],['周皓文','心肺訓練'],
  ['陳映彤','女性肌力'],['李佳穎','活動度'],['劉芷晴','伸展放鬆'],['吳沛蓉','核心穩定'],
  ['黃承恩','體能訓練'],['許雅涵','下肢訓練'],['鄭冠宇','動作練習'],['謝宜庭','初學入門'],
  ['何奕翔','運動習慣'],['蘇品澄','團體課程'],['蔡彥廷','上肢訓練'],['郭思妤','功能訓練'],
].map(([name,specialty],index)=>({id:`coach-${index+1}`,name,specialty,portraitIndex:index,portraitRow:Math.floor(index/4),portraitCol:index%4,fictional:true}));

export const receptionSceneAnchors={
  receptionist:{position:[-4.2,.05,17.45],rotation:0,role:'receptionist',hands:[[-.25,1.17,.47],[.25,1.17,.47]]},
  trainerDeskStaff:{position:[-5.5,.05,10.6],rotation:0,role:'trainer',hands:[[-.24,1.08,.58],[.24,1.08,.58]]},
  conversation:[
    {position:[4.2,.05,13.3],rotation:Math.PI/2,seatHeight:.48,role:'coach'},
    {position:[6.2,.05,13.3],rotation:-Math.PI/2,seatHeight:.48,role:'student'},
  ],
  classInstructor:{position:[-24,.27,23.5],rotation:0,role:'instructor'},
  classParticipants:[
    {position:[-29,.056,26.8],rotation:Math.PI,role:'student'},
    {position:[-19,.056,26.8],rotation:Math.PI,role:'student'},
  ],
};

// Actor-local fixture dimensions mirror the real counter/chair geometry below
// (the entry counter itself is created by gym-architecture.js).
receptionSceneAnchors.receptionist.fixtureVolumes=[
  {id:'entry-counter-body',shape:'box',position:[0,.52,1.25],size:[6.8,1.14,1.45],allowedBodyParts:[]},
  {id:'entry-counter-top',shape:'box',position:[0,1.10,1.25],size:[7,.08,1.6],allowedBodyParts:['leftHand','rightHand']},
];
receptionSceneAnchors.trainerDeskStaff.fixtureVolumes=[
  {id:'trainer-counter-body',shape:'box',position:[0,.48,1],size:[4.4,.96,1.2],allowedBodyParts:[]},
  {id:'trainer-counter-top',shape:'box',position:[0,1.015,1],size:[4.55,.11,1.35],allowedBodyParts:['leftHand','rightHand']},
];
for(const anchor of receptionSceneAnchors.conversation){
  anchor.fixtureVolumes=[
    {id:'consultation-seat',shape:'box',position:[0,.43,0],size:[.65,.1,.62],allowedBodyParts:['pelvis','leftThigh','rightThigh']},
    {id:'consultation-chair-back',shape:'box',position:[0,.79,-.29],size:[.65,.65,.09],allowedBodyParts:['torso','head']},
    {id:'consultation-table-top',shape:'box',position:[0,.62,1],size:[.78,.055,.78],allowedBodyParts:['leftHand','rightHand']},
    {id:'consultation-table-leg',shape:'capsule',start:[0,-.02,1],end:[0,.62,1],radius:.055,allowedBodyParts:[]},
    ...[-1,1].flatMap(x=>[-1,1].map(z=>({id:`consultation-chair-leg-${x}-${z}`,shape:'capsule',start:[x*.25,.05,z*.23],end:[x*.25,.42,z*.23],radius:.026,allowedBodyParts:[]}))),
  ];
}

export function createReceptionScenes({THREE,scene,materials,geometries,extraMaterials,textures,
  box,cylinder,sphere,rod,label,collider,volumeBox=()=>{}}){
  let elapsed=0,measurementStarted=null,measurementProgress=0,classActive=false,lastScreenDraw=-1,receptionCutaway=false;
  const cutawayUniform={value:0},cutawayMaterials=new Set();
  const own=material=>(extraMaterials.add(material),material);
  const mat={
    charcoal:own(new THREE.MeshStandardMaterial({color:'#292e2d',roughness:.78})),
    darkPanel:own(new THREE.MeshStandardMaterial({color:'#424a43',roughness:.87})),
    red:own(new THREE.MeshStandardMaterial({color:'#a63c35',roughness:.72})),
    brass:own(new THREE.MeshStandardMaterial({color:'#c5a357',roughness:.3,metalness:.8})),
    upholstery:own(new THREE.MeshStandardMaterial({color:'#5b756b',roughness:.92})),
    glass:own(new THREE.MeshPhysicalMaterial({color:'#a3b9b5',transparent:true,opacity:.1,roughness:.13,depthWrite:false})),
    classroom:own(new THREE.MeshStandardMaterial({color:'#64726a',roughness:.94})),
    stage:own(new THREE.MeshStandardMaterial({color:'#8a775e',roughness:.88})),
    mirror:own(new THREE.MeshStandardMaterial({color:'#a9c0b5',roughness:.19,metalness:.9})),
  };
  const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;};
  const dynamic=group=>(group.traverse(object=>{object.userData.noStaticBatch=true;}),group);
  function frameText(text,x,y,z,width=2,color='#e3e9da',size=60){const object=label(scene,text,x,y,z,{width,height:.34,color,size});if(x>-12.05&&x<-.45&&z>16.095&&z<17.25&&object.material)cutawayMaterials.add(object.material);return object;}
  function solid(x,y,z,w,h,d,material=mat.darkPanel){box(scene,x,y,z,w,h,d,material);return collider(x,z,w,d);}

  // The entry counter uses the red/charcoal palette common to club receptions;
  // the game retains its own name and fictional staff roster.
  box(scene,-4.2,.58,19.49,6.85,1.04,.055,mat.charcoal);
  box(scene,-4.2,1.1,19.525,6.85,.045,.025,mat.red);
  box(scene,-4.2,.09,19.525,6.85,.06,.025,mat.red);
  frameText('肌動基地',-4.2,.63,19.53,3,'#e9eee4',72);
  const welcome=label(scene,'會員服務',-1.8,1.25,19.12,{width:1.25,height:.27,color:'#e0e8d6',size:56});welcome.rotation.x=-.1;
  // Portrait wall behind the receptionist. Shared atlas material keeps the
  // sixteen headshots at one texture upload and one rigid material batch.
  solid(-4.5,2.6,16.2,8,5.2,.18,mat.charcoal);
  solid(-10.4,2.6,16.2,3.2,5.2,.18,mat.darkPanel);
  frameText('教練團隊',-10.4,4.85,16.32,2.7,'#d8e4d1',66);
  const nameCanvas=document.createElement('canvas');nameCanvas.width=1024;nameCanvas.height=1024;
  const nameContext=nameCanvas.getContext('2d');
  nameContext.fillStyle='#303b32';nameContext.fillRect(0,0,1024,1024);
  coachRoster.forEach(coach=>{
    const x=coach.portraitCol*256,y=coach.portraitRow*256;
    nameContext.fillStyle='#e7eedf';nameContext.textAlign='center';nameContext.textBaseline='middle';
    nameContext.font='700 46px "Microsoft JhengHei",sans-serif';nameContext.fillText(coach.name,x+128,y+92,245);
    nameContext.fillStyle='#b7c9b3';nameContext.font='500 29px "Microsoft JhengHei",sans-serif';nameContext.fillText(coach.specialty,x+128,y+165,245);
  });
  const nameTexture=new THREE.CanvasTexture(nameCanvas);nameTexture.colorSpace=THREE.SRGBColorSpace;textures.add(nameTexture);
  const namesMaterial=own(new THREE.MeshBasicMaterial({map:nameTexture,toneMapped:false}));
  // The CPU qualification harness does not need an Image element. Browsers load
  // the actual original portrait atlas supplied with this project.
  let portraitTexture;
  if(typeof document.createElementNS==='function')portraitTexture=new THREE.TextureLoader().load(publicAssetUrl('images/coaches/coach-roster-atlas.png'));
  else portraitTexture=new THREE.CanvasTexture(nameCanvas);
  portraitTexture.colorSpace=THREE.SRGBColorSpace;textures.add(portraitTexture);
  const portraitMaterial=own(new THREE.MeshBasicMaterial({map:portraitTexture,toneMapped:false}));
  for(const material of [mat.charcoal,mat.darkPanel,mat.brass,mat.glass,materials.wood,portraitMaterial,namesMaterial])cutawayMaterials.add(material);
  function atlasPlane(material,index,width,height,x,y,z){
    const geometry=new THREE.PlaneGeometry(width,height),uv=geometry.getAttribute('uv'),col=index%4,row=Math.floor(index/4);
    for(let i=0;i<uv.count;i++)uv.setXY(i,(col+uv.getX(i))/4,(3-row+uv.getY(i))/4);
    uv.needsUpdate=true;const object=mesh(scene,geometry,material,x,y,z);object.castShadow=false;return object;
  }
  coachRoster.forEach(coach=>{
    const x=-7.35+coach.portraitCol*1.9,y=4.72-coach.portraitRow*1.05;
    box(scene,x,y,16.325,1.82,.98,.065,mat.darkPanel);
    atlasPlane(portraitMaterial,coach.portraitIndex,.78,.78,x-.46,y,16.366);
    atlasPlane(namesMaterial,coach.portraitIndex,.85,.64,x+.42,y,16.37);
  });
  frameText('虛構教練介紹',-10.4,.65,16.62,2.5,'#bfcdb8',48);
  // Trophies and award plaques occupy a glass-front cabinet beside the roster.
  box(scene,-10.4,2.6,16.54,2.9,3.8,.5,mat.charcoal);
  for(const y of [1.2,2.4,3.6,4.4])box(scene,-10.4,y,16.84,2.92,.065,.65,materials.wood);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
    const x=-11.3+col*.9,y=1.25+row*1.2;
    box(scene,x,y+.05,16.9,.32,.1,.3,mat.darkPanel);
    cylinder(scene,x,y+.22,16.9,.045,.26,mat.brass,12);
    mesh(scene,new THREE.CylinderGeometry(.2,.11,.25,16),mat.brass,x,y+.43,16.9);
    for(const sign of [-1,1])mesh(scene,new THREE.TorusGeometry(.13,.025,8,16),mat.brass,x+sign*.19,y+.43,16.9);
    frameText(`${String(row*3+col+1).padStart(2,'0')}`,x,y+.07,17.065,.18,'#d9bd75',64);
  }
  box(scene,-10.4,2.8,17.2,2.9,3.5,.025,mat.glass);collider(-10.4,16.65,3.2,1.1);

  // The trainer's work counter is inside the gym, separate from entry service.
  const trainerDesk=new THREE.Group();scene.add(trainerDesk);trainerDesk.position.set(-5.5,.05,11.6);
  box(trainerDesk,0,.48,0,4.4,.96,1.2,mat.darkPanel);box(trainerDesk,0,1.015,0,4.55,.11,1.35,materials.wood);
  box(trainerDesk,0,.77,.615,4.2,.045,.025,mat.red);collider(-5.5,11.6,4.6,1.4);
  label(trainerDesk,'教練服務',0,.55,.62,{width:2.6,height:.4,color:'#d6e1c9',size:65});
  box(trainerDesk,-.8,1.36,-.1,.72,.49,.065,materials.black);rod(trainerDesk,[-.8,1.07,-.1],[-.8,1.35,-.1],.035,materials.steel);
  box(trainerDesk,-.8,1.08,.28,.62,.025,.21,materials.black);
  for(let i=0;i<3;i++)box(trainerDesk,.85,1.08+i*.035,.15,.6,.03,.4,i%2?mat.red:materials.cream);
  frameText('教練諮詢・課程服務',-5.5,2.55,10.05,5.6,'#d6e2cb',62);

  function chair(anchor){
    const group=new THREE.Group();scene.add(group);group.position.set(...anchor.position);group.rotation.y=anchor.rotation;
    box(group,0,.43,0,.65,.1,.62,mat.upholstery);box(group,0,.79,-.29,.65,.65,.09,mat.upholstery);
    for(const x of [-.25,.25])for(const z of [-.23,.23])rod(group,[x,.05,z],[x,.42,z],.026,materials.steel);
    collider(anchor.position[0],anchor.position[2],.72,.72);
  }
  receptionSceneAnchors.conversation.forEach(chair);
  cylinder(scene,5.2,.67,13.3,.39,.055,materials.wood,24);cylinder(scene,5.2,.35,13.3,.055,.64,materials.steel,12);collider(5.2,13.3,.8,.8);
  box(scene,5.15,.71,13.28,.32,.025,.23,mat.charcoal);
  cylinder(scene,5.35,.77,13.2,.065,.15,materials.cream,12);

  // A separate group studio with an open east doorway, mirror wall, platform
  // and six exercise mats. No desk or partition crosses its access corridor.
  box(scene,-24,.025,26,22,.05,10,mat.classroom);
  volumeBox('classroom-floor',-24,.025,26,22,.05,10,['leftFoot','rightFoot']);
  for(const [id,x,z,w,d]of [['west',-35,26,.16,10],['front',-24,21,22,.16],['back',-24,31,22,.16],['entry-front',-13,22.65,.16,3.3],['entry-back',-13,29.15,.16,3.7]]){solid(x,1.55,z,w,3.1,d,mat.darkPanel);volumeBox(`classroom-wall-${id}`,x,1.55,z,w,3.1,d);}
  box(scene,-24,1.75,21.1,19,2.3,.035,mat.mirror);
  for(let x=-33;x<=-15;x+=3)box(scene,x,1.75,21.13,.035,2.35,.035,materials.chrome);
  box(scene,-24,.16,23.5,14,.22,3.6,mat.stage);collider(-24,23.5,14,3.6);
  volumeBox('classroom-stage',-24,.16,23.5,14,.22,3.6,['leftFoot','rightFoot']);
  gymLayout.classMats.forEach((matPosition,index)=>{box(scene,matPosition.x,.053,matPosition.z,1.7,.006,2.6,materials.pad);volumeBox(`classroom-mat-${index+1}`,matPosition.x,.053,matPosition.z,1.7,.006,2.6,['leftFoot','rightFoot']);});
  label(scene,'團體教室  /  GROUP STUDIO',-12.9,2.55,25.8,{width:5.4,height:.5,color:'#dce7d3',size:58},Math.PI/2);
  frameText('舞蹈・飛輪・肌力・身心',-24,3,21.18,10,'#e0e6d7',64);
  for(const x of [-32.7,-15.3]){
    box(scene,x,.73,22.1,.6,1.25,.45,materials.black);
    for(const y of [.42,.95]){const cone=cylinder(scene,x,y,22.35,.18,.025,materials.graphite,20);cone.rotation.x=Math.PI/2;}
  }
  for(const x of [-32.7,-31.6,-30.5]){
    cylinder(scene,x,.38,30.3,.21,.6,materials.pad,16);collider(x,30.3,.5,.5);
  }

  // Body composition station. Electrode pads are flush with the platform;
  // grip and shoe targets match sampleInBodyPose in facility-poses.js.
  const inbodyOrigin=[7.3,.05,20.7],inbody=new THREE.Group();scene.add(inbody);inbody.position.set(...inbodyOrigin);inbody.rotation.y=Math.PI;
  box(inbody,0,.05,.11,.92,.1,.82,materials.cream);
  box(inbody,0,.085,.11,.88,.03,.78,mat.charcoal);
  for(const sign of [-1,1])box(inbody,sign*.18,.099,.145,.16,.002,.29,materials.chrome);
  rod(inbody,[0,.12,.55],[0,1.3,.55],.055,materials.steel);
  box(inbody,0,1.37,.55,.78,.54,.1,mat.charcoal);
  for(const sign of [-1,1]){
    rod(inbody,[sign*.33,.98,.08],[sign*.33,.98,.28],.026,materials.chrome);
    rod(inbody,[sign*.33,.98,.28],[sign*.2,1.12,.53],.006,materials.black);
    const color=sign<0?'left':'right';
    volumeBox(`inbody-${color}-grip`,7.3-sign*.33,.05+.98,20.7-.18,.052,.052,.2,[`${color}Hand`,`${color}Forearm`]);
  }
  volumeBox('inbody-platform',7.3,.10,20.59,.92,.10,.82,['leftFoot','rightFoot']);
  volumeBox('inbody-column',7.3,.76,20.15,.11,1.23,.11);
  volumeBox('inbody-display',7.3,1.42,20.15,.78,.54,.1);
  collider(7.3,20.55,.95,1.2);
  const displayCanvas=document.createElement('canvas');displayCanvas.width=640;displayCanvas.height=400;
  const displayContext=displayCanvas.getContext('2d'),displayTexture=new THREE.CanvasTexture(displayCanvas);displayTexture.colorSpace=THREE.SRGBColorSpace;textures.add(displayTexture);
  displayTexture.name='inbody-display';displayTexture.userData.dynamicCanvasKind='inbody';
  const displayMaterial=own(new THREE.MeshBasicMaterial({map:displayTexture,toneMapped:false}));
  const display=mesh(inbody,new THREE.PlaneGeometry(.68,.42),displayMaterial,0,1.37,.494);display.rotation.y=Math.PI;display.castShadow=false;dynamic(display);
  label(inbody,'InBody',0,.44,.526,{width:.55,height:.15,color:'#d8dfd4',size:72},Math.PI);
  label(scene,'體組成分析・操作示意',7.3,2.05,20.1,{width:3.4,height:.35,color:'#d7e3c9',size:54});
  const demoReport={label:'固定範例，非玩家量測',weightKg:68.4,skeletalMuscleKg:30.2,bodyFatPercent:20.0};
  let lastMeasurementKey=null,measurementDraws=0,measurementSkipped=0;
  function drawMeasurement(){
    const key=measurementCanvasKey(measurementStarted!==null,measurementProgress);
    if(key===lastMeasurementKey){measurementSkipped++;return false;}
    const ctx=displayContext;ctx.fillStyle='#172f35';ctx.fillRect(0,0,640,400);ctx.textAlign='left';
    ctx.fillStyle='#d8e9cc';ctx.font='700 42px "Microsoft JhengHei",sans-serif';ctx.fillText('InBody 操作示意',32,60);
    ctx.fillStyle='#b7cac5';ctx.font='28px "Microsoft JhengHei",sans-serif';ctx.fillText(measurementStarted===null?'站上電極台，雙手握穩':measurementProgress<1?'示範掃描中':'示範完成',32,125);
    ctx.fillStyle='#456066';ctx.fillRect(32,165,576,28);ctx.fillStyle='#b4d688';ctx.fillRect(32,165,576*measurementProgress,28);
    if(measurementProgress>=1){ctx.fillStyle='#e1ece0';ctx.font='25px "Microsoft JhengHei",sans-serif';ctx.fillText('固定範例　68.4 kg',32,253);ctx.fillText('不是玩家的量測結果',32,304);}
    else {ctx.fillStyle='#e1ece0';ctx.font='700 44px "Microsoft JhengHei",sans-serif';ctx.fillText(`${Math.round(measurementProgress*100)}%`,32,271);}
    ctx.fillStyle='#90aaa3';ctx.font='22px "Microsoft JhengHei",sans-serif';ctx.fillText('遊戲示意・不讀取身體資料',32,367);displayTexture.needsUpdate=true;lastMeasurementKey=key;measurementDraws++;return true;
  }
  drawMeasurement();
  // Keep rigid material batching while cutting only the wall/portrait/trophy
  // region out of the camera view. Its colliders and shadow casters stay put.
  for(const material of cutawayMaterials){
    const previousCompile=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
    material.onBeforeCompile=function(shader,renderer){
      previousCompile?.call(this,shader,renderer);
      shader.uniforms.formReceptionCutaway=cutawayUniform;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFormReceptionWorld;').replace('#include <project_vertex>','#include <project_vertex>\nvFormReceptionWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float formReceptionCutaway;\nvarying vec3 vFormReceptionWorld;').replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
        if(formReceptionCutaway>.5 && vFormReceptionWorld.x>-12.05 && vFormReceptionWorld.x<-.45 && vFormReceptionWorld.y>.12 && vFormReceptionWorld.z>16.095 && vFormReceptionWorld.z<17.25) discard;`);
    };
    material.customProgramCacheKey=function(){return `${previousKey?.call(this)||''}:form-reception-cutaway-v1`;};
    material.needsUpdate=true;
  }
  const viewRay=new THREE.Ray(),rayOrigin=new THREE.Vector3(),rayTarget=new THREE.Vector3(),rayHit=new THREE.Vector3();
  const viewBoxes=[
    new THREE.Box3(new THREE.Vector3(-8.5,.12,16.11),new THREE.Vector3(-.5,5.2,16.29)),
    new THREE.Box3(new THREE.Vector3(-12,.12,16.11),new THREE.Vector3(-8.8,5.2,16.29)),
    new THREE.Box3(new THREE.Vector3(-12,1.2,16.3),new THREE.Vector3(-8.8,4.55,17.25)),
  ];
  function updateView(camera,focus){
    if(!camera||!focus){receptionCutaway=false;cutawayUniform.value=0;return false;}
    camera.isVector3?rayOrigin.copy(camera):rayOrigin.fromArray(camera);
    focus.isVector3?rayTarget.copy(focus):rayTarget.fromArray(focus);
    const targetDistance=rayOrigin.distanceTo(rayTarget);
    viewRay.set(rayOrigin,rayTarget.clone().sub(rayOrigin).normalize());
    receptionCutaway=targetDistance>.4&&viewBoxes.some(bounds=>{
      const hit=viewRay.intersectBox(bounds,rayHit);return hit&&rayOrigin.distanceTo(hit)<targetDistance-.4;
    });
    cutawayUniform.value=receptionCutaway?1:0;return receptionCutaway;
  }
  return {
    getSceneAnchors(){return JSON.parse(JSON.stringify(receptionSceneAnchors));},
    getCoachRoster(){return coachRoster.map(coach=>({...coach}));},
    beginActivity(id){if(id==='inbody'){measurementStarted=elapsed;measurementProgress=0;drawMeasurement();lastScreenDraw=elapsed;}if(id==='group-class')classActive=true;},
    endActivity(id){if(id==='inbody'){measurementStarted=null;measurementProgress=0;drawMeasurement();}if(id==='group-class')classActive=false;},
    update(time){elapsed=time;if(measurementStarted!==null)measurementProgress=Math.min(1,Math.max(0,(elapsed-measurementStarted)/8));if(elapsed-lastScreenDraw>.15||measurementProgress>=1&&lastMeasurementKey!=='complete'){drawMeasurement();lastScreenDraw=elapsed;}},
    updateView,
    getDiagnostics(){return {coachCount:coachRoster.length,portraitAtlas:publicAssetUrl('images/coaches/coach-roster-atlas.png'),trophyCount:9,trainerDesk:true,conversationSeats:2,receptionCutaway,classroom:{active:classActive,mats:gymLayout.classMats.length},inbody:{active:measurementStarted!==null,progress:measurementProgress,complete:measurementProgress>=1,report:measurementProgress>=1?{...demoReport}:null,canvas:{redraws:measurementDraws,uploadRequests:measurementDraws,skippedIdentical:measurementSkipped,key:lastMeasurementKey}}};},
  };
}
