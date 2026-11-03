import {gymLayout,facilityStations,floorHeightAt} from './gym-layout.js';
import {buildLocomotionPose} from './locomotion.js';
import {sampleInBodyPose,sampleGroupClassPose} from './facility-poses.js';
import {createReceptionScenes} from './reception-scenes.js';
import {createRoomZones,roomForStation} from './room-zones.js';
import {createVisibleCanvasAnimator} from './canvas-updates-v012.js';

/** Room fixtures and interactive recovery facilities share the same floor plan
 * as navigation and the map. Sports screens are original canvas animations. */
export function createGymArchitecture({THREE,scene,materials,geometries,extraMaterials,textures,
  box,cylinder,sphere,rod,label,collider,plant,dumbbell}) {
  const {bounds}=gymLayout;
  const facilities=new Map(),doors=new Map(),screens=[],steamPuffs=[],showers=[],waterSurfaces=[],walls=[],collisionBoxes=[],lastPoses=new Map();
  const geometryCache=new Map();
  let elapsed=0,lastScreenTime=-1,activeFacility=null,bathElapsed=0,bathEffectTicks=0,bathSkippedTicks=0;
  const own=material=>(extraMaterials.add(material),material);
  const surface={
    free:own(new THREE.MeshStandardMaterial({color:'#6b6556',roughness:.95})),
    walk:own(new THREE.MeshStandardMaterial({color:'#606a5c',roughness:.96})),
    arrival:own(new THREE.MeshStandardMaterial({color:'#87745f',roughness:.91})),
    fixed:own(new THREE.MeshStandardMaterial({color:'#37483e',roughness:.95})),
    plate:own(new THREE.MeshStandardMaterial({color:'#4b4841',roughness:.95})),
    tile:own(new THREE.MeshStandardMaterial({color:'#768d86',roughness:.85})),
    wall:own(new THREE.MeshStandardMaterial({color:'#7f8b80',roughness:.85})),
    saunaWood:own(new THREE.MeshStandardMaterial({color:'#bd9670',roughness:.76})),
    darkWood:own(new THREE.MeshStandardMaterial({color:'#7c624c',roughness:.8})),
    mirror:own(new THREE.MeshStandardMaterial({color:'#a3bdb5',metalness:.9,roughness:.16})),
    water:own(new THREE.MeshPhysicalMaterial({color:'#6bb9c9',transparent:true,opacity:.55,roughness:.17,metalness:.25,depthWrite:false})),
    waterFlow:own(new THREE.MeshBasicMaterial({color:'#c1edf4',transparent:true,opacity:.52,depthWrite:false})),
    steam:own(new THREE.MeshBasicMaterial({color:'#e9f6f2',transparent:true,opacity:.12,depthWrite:false})),
    aqua:own(new THREE.MeshStandardMaterial({color:'#77b4ba',roughness:.7})),
    showerPan:own(new THREE.MeshStandardMaterial({color:'#6e8581',roughness:.92})),
    floorStripe:own(new THREE.MeshStandardMaterial({color:'#e6ddbd',roughness:.9})),
  };
  const cached=(key,make)=>{if(!geometryCache.has(key)){const geometry=make();geometryCache.set(key,geometry);geometries.add(geometry);}return geometryCache.get(key);};
  function mesh(parent,geometry,material,x=0,y=0,z=0){const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
  function dynamic(group){group.traverse(object=>{object.userData.noStaticBatch=true;});return group;}
  function volumeBox(id,x,y,z,w,h,d,allowedBodyParts=[]){collisionBoxes.push({id,position:[x,y,z],size:[w,h,d],allowedBodyParts});}
  function wall(x,z,w,d,height=2.6,material=surface.wall){
    const object=box(scene,x,height/2+.08,z,w,height,d,material);
    object.userData.roomShell=true;
    if(x>=11&&z>=8){
      object.userData.noStaticBatch=true;
      const cutaway=material.clone();cutaway.transparent=true;cutaway.opacity=.14;cutaway.depthWrite=false;extraMaterials.add(cutaway);
      walls.push({object,material,cutaway,x,z,w,d});
      volumeBox(`wall-${walls.length}`,x,height/2+.08,z,w,height,d);
    }
    return collider(x,z,w,d);
  }
  function floorText(text,x,z,width=8,color='#e7e5d7'){
    const object=label(scene,text,x,floorHeightAt(x,z)+.008,z,{width,height:.7,color,size:64});object.rotation.x=-Math.PI/2;return object;
  }
  function sign(text,x,z,width,color='#d5dfc6'){
    box(scene,x,3.8,z,width+.3,.65,.12,materials.graphite);
    label(scene,text,x,3.8,z+.08,{width,height:.5,color,size:62});
  }
  function makeDoor(id,{x,z,width=1.7,rotation=0,openRotation=rotation+Math.PI/2,blocker,material=surface.saunaWood}){
    const group=new THREE.Group();scene.add(group);group.position.set(x,.08,z);group.rotation.y=rotation;
    box(group,width/2,1.12,0,width,2.24,.07,material);
    box(group,width-.16,1.05,.07,.05,.28,.055,materials.chrome);
    box(group,width/2,1.7,.042,width-.26,.35,.016,materials.glass);
    dynamic(group);
    const obstruction=collider(...blocker);
    const record={id,group,closed:rotation,opened:openRotation,target:rotation,obstruction,closeAt:null};
    doors.set(id,record);return record;
  }
  function doorOpen(id,open=true){const record=doors.get(id);if(!record)return false;record.target=open?record.opened:record.closed;if(record.obstruction)record.obstruction.disabled=open;return true;}

  // Large open ceiling; the camera can follow the player through every zone.
  const roomW=bounds.maxX-bounds.minX,roomD=bounds.maxZ-bounds.minZ;
  box(scene,(bounds.minX+bounds.maxX)/2,-.15,(bounds.minZ+bounds.maxZ)/2,roomW,.3,roomD,materials.rubber);
  for(let x=bounds.minX+1;x<bounds.maxX;x+=2)for(let z=bounds.minZ+1;z<bounds.maxZ;z+=2)
    box(scene,x,.006,z,1.975,.012,1.975,((x+z)/2)%2?materials.rubber:materials.rubberAlt);
  box(scene,-22.5,.014,-3,25,.028,20,surface.free);
  box(scene,.5,.013,-3,17,.026,20,surface.fixed);
  box(scene,19,.013,-3,16,.026,20,surface.plate);
  box(scene,-4,.0175,-20.5,62,.035,15,materials.graphite);
  box(scene,-23.5,.03,14,23,.06,10,materials.grass);
  box(scene,0,.025,16.5,18,.05,13,surface.arrival);
  box(scene,19.5,.04,16,17,.08,16,surface.tile);
  for(const x of [-9,10])box(scene,x,.0175,5.5,1.4,.035,37,surface.walk);
  box(scene,-11.8,.0175,25.5,2,.035,11,surface.walk);
  box(scene,-4,.018,8,62,.036,1.4,surface.walk);
  for(const x of [-35,-10,-8,9,11,27])box(scene,x,.034,-3,.07,.014,20,surface.floorStripe);
  for(let x=-33;x<-12;x+=3.7)box(scene,x,.066,14,.045,.012,9.5,materials.cream);
  for(const z of [10,14,18])floorText(String((z-10)*5).padStart(2,'0'),-13,z,1.1,'#e4ead7');
  floorText('自由重量  /  FREE WEIGHTS',-22.5,6,17);
  floorText('固定器材',.5,6,8,'#c8d7c4');
  floorText('槓片訓練',19,6,8,'#dbc8a7');
  floorText('草皮・伸展',-23.5,18,12);
  floorText('有氧訓練',-4,-17,12);
  sign('自由重量  FREE WEIGHTS',-23,-12.8,15,'#f2d5a0');
  sign('固定器材  STRENGTH',.5,-12.8,11,'#cce5c0');
  sign('槓片訓練  PLATE LOADED',19,-12.8,12,'#e4c89e');

  // Rear glazing and restrained mirror panels along the expanded dumbbell area.
  const rearZ=bounds.minZ+.1,roomCenterZ=(bounds.minZ+bounds.maxZ)/2;
  box(scene,-4,.45,rearZ,64,.9,.2,materials.cream);
  box(scene,-4,3.1,rearZ-.03,64,4.4,.04,materials.glass);
  box(scene,-4,5.25,rearZ,64,.16,.2,materials.graphite);
  for(let x=-36;x<=28;x+=8)box(scene,x,2.65,rearZ+.05,.12,5.3,.14,materials.graphite);
  box(scene,-36,2.6,roomCenterZ,.25,5.2,roomD,materials.cream);
  box(scene,28,2.6,roomCenterZ,.25,5.2,roomD,materials.cream);
  box(scene,-35.84,1.8,-3,.035,2.6,21,surface.mirror);
  for(let z=-13;z<8;z+=3)box(scene,-35.8,1.8,z,.05,2.7,.045,materials.chrome);
  for(const z of [-26,-14,-3,9,21,31]){
    box(scene,-4,5.35,z,64,.16,.2,materials.graphite);
    for(const x of [-29,-17,-4,8,21])box(scene,x,5.18,z,7,.055,.16,materials.light);
  }
  const city=own(new THREE.MeshStandardMaterial({color:'#aab8ad',roughness:.95}));
  for(let i=0;i<20;i++){
    const x=-64+i*6.3,height=7+(i*17)%11,z=-42-(i%3)*7;
    box(scene,x,height/2-3.5,z,4.1,height,5,city);
    for(let y=0;y<height-1;y+=1.8)box(scene,x,y-2.5,z+2.55,3,.25,.05,materials.glass);
  }

  // Reception has a straight, unobstructed entrance and a separate lounge.
  const desk=new THREE.Group();scene.add(desk);desk.position.set(-4.2,0,18.7);
  box(desk,0,.57,0,6.8,1.14,1.45,materials.wood);box(desk,0,1.15,0,7,.08,1.6,materials.cream);
  for(let x=-3.2;x<3.3;x+=.22)box(desk,x,.54,.735,.045,.92,.025,materials.cream);
  label(desk,'F O R M',0,.65,.76,{width:2.6,height:.38,color:'#253a2d',size:76});
  for(const x of [-1.8,1.8]){box(desk,x,1.4,-.12,.75,.5,.07,materials.black);rod(desk,[x,1.16,-.12],[x,1.4,-.12],.04,materials.steel);}
  collider(-4.2,18.7,7,1.6);
  label(scene,'入口・接待櫃台',-4,3.4,23.8,{width:10,height:.65,color:'#334d3b',size:68},Math.PI);
  for(const x of [-1.8,3.8]){box(scene,x,.55,22.6,.32,1.1,1.2,materials.steel);collider(x,22.6,.4,1.25);}
  for(const x of [3.2,6.4]){box(scene,x,.4,17.7,2.3,.6,1.1,materials.pad);box(scene,x,.86,18.1,2.3,.65,.25,materials.pad);collider(x,17.7,2.5,1.4);}
  cylinder(scene,4.8,.45,15.8,.55,.05,materials.wood);cylinder(scene,4.8,.22,15.8,.06,.45,materials.graphite);collider(4.8,15.8,1.1,1.1);

  // More rack length, spare benches and open work bays define the free weights.
  for(const y of [.5,.96]){
    box(scene,-34.6,y,-3,.85,.1,13,materials.graphite);
    for(let z=-9;z<=3;z+=.7){const weight=dumbbell(scene,-34.6,y+.13,z);weight.rotation.y=Math.PI/2;}
  }
  for(const z of [-9.1,3.1])box(scene,-34.6,.55,z,.75,1.1,.09,materials.graphite);
  collider(-34.6,-3,1.1,13.3);
  for(const x of [-30]){
    box(scene,x,.47,3.8,.65,.12,2,materials.pad);
    for(const z of [3.2,4.5])box(scene,x,.25,z,.8,.5,.1,materials.steel);
    collider(x,3.8,.9,2.2);
  }
  for(const mat of gymLayout.staticMats){
    box(scene,mat.x,.09,mat.z,1.7,.07,2.8,materials.pad);
    const roller=cylinder(scene,mat.x,.25,mat.z+1.6,.17,.7,materials.black);roller.rotation.z=Math.PI/2;
  }
  for(let i=0;i<6;i++){
    const x=-34+i*.65;sphere(scene,x,.25,8.8,.2,materials.black);
    mesh(scene,cached('kettlebell-ring',()=>new THREE.TorusGeometry(.11,.025,8,16)),materials.steel,x,.48,8.8);
  }
  for(const [x,z,size] of [[-33,21,1.3],[8.7,25.6,1.1],[26,-22,1.1],[-34,-22,1.1]])plant(x,z,size);

  // Enclosed wet area. Every toilet/shower has walls and a working door.
  wall(11,16,.18,16);wall(19.5,24,17,.18);
  wall(12,8,2,.18);wall(22.5,8,11,.18);
  label(scene,'更衣・淋浴・三溫暖',20.3,2.15,7.87,{width:10,height:.6,color:'#e0eadb',size:62},Math.PI);
  floorText('更衣・淋浴',14.1,9.2,4,'#41676a');
  for(let z=10;z<13;z+=.75){
    for(let level=0;level<2;level++){
      box(scene,11.5,.65+level*1.12,z,.6,1.04,.68,materials.wood);
      box(scene,11.82,.65+level*1.12,z+.2,.04,.2,.04,materials.graphite);
    }
  }
  collider(11.5,11.2,.7,3.5);
  box(scene,13.2,.43,16.5,.8,.15,3,materials.wood);collider(13.2,16.5,.9,3.1);
  // Sinks face the open lobby between the facilities and the toilet stalls.
  box(scene,16.8,.86,10.1,.72,.15,2.8,materials.wood);collider(16.8,10.1,.8,2.8);
  for(const z of [9.4,10.8]){
    const sink=sphere(scene,16.8,.94,z,.29,materials.white);sink.scale.set(.9,.28,1.2);
    rod(scene,[16.55,.92,z],[16.55,1.2,z],.025,materials.chrome);rod(scene,[16.55,1.2,z],[16.78,1.2,z],.025,materials.chrome);
  }
  box(scene,16.47,1.75,10.1,.035,1.25,2.8,surface.mirror);
  for(const x of [20,25]){
    wall(x-2,10.025,.12,3.55,2.4);wall(x,8.25,4,.12,2.4);
    wall(x-1.62,11.8,.75,.12,2.4);wall(x+1.38,11.8,1.25,.12,2.4);
    const id=x===20?'toilet-1':'toilet-2';
    makeDoor(id,{x:x-1.25,z:11.8,width:1.9,rotation:0,openRotation:-Math.PI/2,blocker:[x-.3,11.8,1.9,.12]});
    const bowl=sphere(scene,x,.4,9.6,.33,materials.white);bowl.scale.set(1.05,.65,1.35);
    cylinder(scene,x,.17,9.6,.19,.3,materials.white);box(scene,x,.46,9.68,.53,.06,.7,materials.white);
    box(scene,x,.69,9.15,.6,.68,.25,materials.white);collider(x,9.6,.8,1.1);
    volumeBox(`${id}-closed-lid`,x,.46,9.68,.53,.06,.7,['pelvis','leftThigh','rightThigh']);
    volumeBox(`${id}-tank`,x,.69,9.15,.6,.68,.25);
    const roll=cylinder(scene,x-1.85,.85,10.3,.09,.24,materials.white);roll.rotation.z=Math.PI/2;
    label(scene,x===20?'廁所 A':'廁所 B',x,2.05,11.9,{width:2.4,height:.4,color:'#dce6d8',size:52});
  }
  wall(27.5,10.025,.12,3.55,2.4);
  wall(22,10.025,.12,3.55,2.4);

  // Three recovery rooms share a wide west corridor. Doors open into the rooms.
  for(const [id,z,wood] of [['cold-plunge',14.9,false],['steam-room',18.5,false],['sauna',22.1,true]]){
    const roomMat=wood?surface.saunaWood:surface.tile;
    wall(16,z-(id==='cold-plunge'?1.3:1.65),.12,.7,2.55,roomMat);wall(16,z+1.18,.12,1.1,2.55,roomMat);
    wall(18.85,z-(id==='cold-plunge'?1.65:1.8),5.8,.12,2.55,roomMat);wall(21.7,z,.12,3.6,2.55,roomMat);
    wall(18.85,z+1.8,5.8,.12,2.55,roomMat);
    makeDoor(id,{x:16,z:z-.95,width:1.65,rotation:-Math.PI/2,openRotation:0,blocker:[16,z-.125,.12,1.65],material:wood?surface.darkWood:surface.aqua});
    label(scene,facilityStations.find(station=>station.id===id).name,15.9,2.05,z,{width:2.5,height:.4,color:'#dae5d4',size:54},-Math.PI/2);
    if(id==='cold-plunge'){
      box(scene,19.2,.13,z,4.2,.18,2.6,surface.aqua);
      volumeBox(`${id}-floor`,19.2,.13,z,4.2,.18,2.6,['leftFoot','rightFoot']);
      // The west rim has a real walk-in opening, with two shallow entry steps.
      for(const [x,center,length] of [[17.15,z-1.225,.25],[17.15,z+.575,1.55],[21.25,z,2.7]]){box(scene,x,.45,center,.18,.72,length,materials.cream);volumeBox(`${id}-rim-x${x}-${center}`,x,.45,center,.18,.72,length);}
      for(const [x,top,width] of [[16.72,.15,.64],[17.08,.22,.22]]){box(scene,x,(top+.08)/2,z-.6,width,top-.08,1.05,surface.tile);volumeBox(`${id}-entry-step-${x}`,x,(top+.08)/2,z-.6,width,top-.08,1.05,['leftFoot','rightFoot']);}
      for(const zz of [z-1.25,z+1.25]){box(scene,19.2,.45,zz,4.2,.72,.18,materials.cream);volumeBox(`${id}-rim-z${zz}`,19.2,.45,zz,4.2,.72,.18);}
      box(scene,19.2,.27,z+.3,3.2,.2,.7,surface.tile);
      volumeBox(`${id}-seat`,19.2,.27,z+.3,3.2,.2,.7,['pelvis','leftThigh','rightThigh']);
      const water=mesh(scene,cached('pool-water',()=>new THREE.PlaneGeometry(3.9,2.35,12,8)),surface.water,19.2,.66,z);water.rotation.x=-Math.PI/2;dynamic(water);waterSurfaces.push({id,mesh:water});
      label(scene,'冷水池',19.2,1.5,z+1.72,{width:3,height:.4,color:'#447e8b',size:64},Math.PI);
    }else{
      const benchMat=wood?surface.saunaWood:surface.tile;
      box(scene,19.2,.43,z+.85,4.6,.19,.65,benchMat);box(scene,19.2,.24,z+1.35,5,.35,.45,benchMat);
      volumeBox(`${id}-bench`,19.2,.43,z+.85,4.6,.19,.65,['pelvis','leftThigh','rightThigh']);
      volumeBox(`${id}-lower-bench`,19.2,.24,z+1.35,5,.35,.45,['pelvis','leftThigh','rightThigh']);
      collider(19.2,z+.85,4.7,.8);
      if(wood){
        for(let yy=.2;yy<2.45;yy+=.16){box(scene,19.1,yy,z+1.72,6.05,.025,.035,surface.darkWood);box(scene,22.12,yy,z,.035,.025,3.3,surface.darkWood);}
        for(let x=17;x<21.5;x+=.15)box(scene,x,.535,z+.85,.035,.015,.61,surface.darkWood);
        box(scene,17.05,.45,z-.85,.65,.75,.65,materials.graphite);collider(17.05,z-.85,.7,.7);
        for(let i=0;i<7;i++)sphere(scene,16.83+(i%3)*.19,.85+Math.floor(i/3)*.07,z-.9+(i%2)*.14,.12,materials.steel);
        label(scene,'乾式烤箱',19.2,1.9,z+1.71,{width:4,height:.45,color:'#584431',size:64},Math.PI);
      }else{
        for(let i=0;i<9;i++){
          const puff=mesh(scene,cached('steam-puff',()=>new THREE.SphereGeometry(.32,10,8)),surface.steam,17.1+(i%3)*1.3,.25+(i%4)*.45,z-.8+(i%2)*1.1);
          puff.scale.set(1.8,.7,1.3);dynamic(puff);steamPuffs.push({id,mesh:puff,offset:i*.73,baseX:puff.position.x,baseZ:puff.position.z});
        }
        label(scene,'蒸氣室',19.2,1.9,z+1.71,{width:3,height:.45,color:'#416b70',size:64},Math.PI);
      }
    }
  }

  for(const [id,z] of [['shower-1',16],['shower-2',21]]){
    wall(23.5,z-1.85,.12,.7,2.5);wall(23.5,z+1.4,.12,1.05,2.5);
    wall(25.5,z-2.1,4,.12,2.5);wall(25.5,z+2.1,4,.12,2.5);
    makeDoor(id,{x:23.5,z:z-1.5,width:2.3,rotation:-Math.PI/2,openRotation:0,blocker:[23.5,z-.35,.12,2.3],material:surface.aqua});
    box(scene,25.7,.09,z,3.7,.025,3.7,surface.showerPan);
    rod(scene,[27.4,1.1,z],[27.4,2.15,z],.025,materials.chrome);rod(scene,[27.4,2.15,z],[26.5,2.15,z],.035,materials.chrome);
    const head=cylinder(scene,26.5,2.1,z,.19,.045,materials.chrome,20);
    box(scene,27.45,1.3,z,.055,.22,.18,materials.steel);box(scene,27.4,1.1,z+.8,.55,.07,.4,materials.wood);
    box(scene,26.5,.112,z,.3,.012,.3,materials.graphite);
    const stream=new THREE.Group();scene.add(stream);
    for(let i=0;i<15;i++){
      const angle=i*2.4,radius=.04+(i%3)*.035;
      const drop=cylinder(stream,26.5+Math.cos(angle)*radius,1.12,z+Math.sin(angle)*radius,.008,1.86,surface.waterFlow,6);
      drop.userData.phase=i*.25;
    }
    stream.visible=false;dynamic(stream);showers.push({id,group:stream,head});
    label(scene,id==='shower-1'?'淋浴 A':'淋浴 B',23.39,2.05,z,{width:2.7,height:.4,color:'#dbe7df',size:56},-Math.PI/2);
  }
  box(scene,9,.7,11.3,.8,1.4,.75,materials.steel);collider(9,11.3,.9,.85);
  box(scene,9,1.17,11.68,.55,.3,.04,materials.black);
  label(scene,'飲水機',9,1.85,11.7,{width:1.6,height:.3,color:'#3c5b49',size:54});

  function canvasPanel(width,height,draw){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');draw(context,canvas);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);
    const material=own(new THREE.MeshBasicMaterial({map:texture,toneMapped:false,side:THREE.DoubleSide}));
    return {canvas,context,texture,material};
  }
  const posters=[
    {title:'巷口運動',headline:'下班，來練一組。',detail:'台北・重量訓練・新手入門',color:'#d9ee9b',ink:'#213c34'},
    {title:'肌動團練',headline:'週三，下班一起練。',detail:'啞鈴基礎 ｜ 動作練習 ｜ 課後伸展',color:'#ebae83',ink:'#452c21'},
    {title:'伸展時間',headline:'草皮區，留個空位。',detail:'髖部活動・胸椎轉動・腿後側伸展',color:'#9bc5d1',ink:'#223c49'},
  ];
  const posterPositions=[[-35.8,3.6,3,Math.PI/2],[-35.8,3.4,16,Math.PI/2],[27.8,3.4,-8,-Math.PI/2]];
  posters.forEach((poster,index)=>{
    const panel=canvasPanel(1024,512,(ctx,c)=>{
      ctx.fillStyle=poster.color;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=poster.ink;
      ctx.font='700 43px "Microsoft JhengHei",sans-serif';ctx.fillText(poster.title,55,77);
      ctx.font='800 78px "Microsoft JhengHei",sans-serif';ctx.fillText(poster.headline,52,226,920);
      ctx.font='500 34px "Microsoft JhengHei",sans-serif';ctx.fillText(poster.detail,55,325,900);
      ctx.fillRect(55,380,350,4);ctx.font='600 26px "Microsoft JhengHei",sans-serif';ctx.fillText('肌動基地・台北訓練所',55,441);
      ctx.strokeStyle=poster.ink;ctx.lineWidth=14;ctx.beginPath();ctx.arc(854,420,55,0,Math.PI*2);ctx.stroke();
    });
    const [x,y,z,rotation]=posterPositions[index];
    const object=mesh(scene,cached('poster',()=>new THREE.PlaneGeometry(6,3)),panel.material,x,y,z);object.rotation.y=rotation;object.castShadow=false;
  });

  function drawSports(screen,t){
    const ctx=screen.context,w=screen.canvas.width,h=screen.canvas.height;
    ctx.fillStyle='#122b36';ctx.fillRect(0,0,w,h);
    ctx.fillStyle=screen.kind==='basketball'?'#c29a6a':'#326b51';ctx.fillRect(0,48,w,h-88);
    ctx.strokeStyle='#f4edda';ctx.lineWidth=3;
    if(screen.kind==='basketball'){
      ctx.strokeRect(25,66,w-50,h-127);ctx.beginPath();ctx.moveTo(w/2,67);ctx.lineTo(w/2,h-60);ctx.stroke();
      ctx.beginPath();ctx.ellipse(w/2,h/2+5,48,37,0,0,Math.PI*2);ctx.stroke();
      for(const x of [50,w-50]){ctx.strokeRect(x<100?25:w-130,102,105,h-200);ctx.beginPath();ctx.arc(x,h/2,12,0,Math.PI*2);ctx.stroke();}
      for(let i=0;i<10;i++){
        const team=i<5,base=i%5,px=120+base*110+Math.sin(t*.7+i)*47,py=105+(i%3)*61+Math.cos(t+i)*15;
        ctx.fillStyle=team?'#e2f0d7':'#1f6e95';ctx.beginPath();ctx.ellipse(px,py,13,19,Math.sin(t*3+i)*.15,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#d7ad87';ctx.beginPath();ctx.arc(px,py-20,7,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=team?'#e2f0d7':'#1f6e95';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(px-7,py+14);ctx.lineTo(px-11+Math.sin(t*6+i)*7,py+30);ctx.moveTo(px+7,py+14);ctx.lineTo(px+11-Math.sin(t*6+i)*7,py+30);ctx.stroke();
      }
      const travel=(t*.22)%2,ballX=travel<1?100+travel*(w-200):w-100-(travel-1)*(w-200);
      ctx.fillStyle='#ef8b39';ctx.beginPath();ctx.arc(ballX,155-Math.abs(Math.sin(t*3))*45,8,0,Math.PI*2);ctx.fill();
    }else{
      ctx.fillStyle='#a98558';ctx.beginPath();ctx.moveTo(w/2,h-61);ctx.lineTo(w/2-123,160);ctx.lineTo(w/2,76);ctx.lineTo(w/2+123,160);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#e7ecd7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(25,75);ctx.lineTo(w/2,h-61);ctx.lineTo(w-25,75);ctx.stroke();
      for(let i=0;i<9;i++){const a=i*.78,px=w/2+Math.cos(a)*180,py=158+Math.sin(a)*70;ctx.fillStyle=i%2?'#f1eee6':'#235d88';ctx.fillRect(px-6,py-12,12,22);ctx.fillStyle='#e1b190';ctx.beginPath();ctx.arc(px,py-15,6,0,Math.PI*2);ctx.fill();}
      const pitch=(t*.6)%1;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(w/2+Math.sin(t)*10,123+pitch*128,4,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#102935';ctx.fillRect(0,0,w,46);ctx.fillRect(0,h-40,w,40);
    ctx.fillStyle='#d6eb9e';ctx.font='bold 25px "Microsoft JhengHei",sans-serif';ctx.fillText('肌動運動台',21,32);
    ctx.fillStyle='#f5f6ed';ctx.font='bold 22px "Microsoft JhengHei",sans-serif';ctx.fillText(screen.kind==='basketball'?'台北  42  :  38  台中':'藍隊  2  :  1  白隊',w-340,31);
    ctx.font='20px "Microsoft JhengHei",sans-serif';ctx.fillText(screen.kind==='basketball'?'籃球練習賽  ｜  比賽精華':'棒球練習賽  ｜  場邊轉播',21,h-14);
    ctx.fillStyle='#d6eb9e';ctx.fillText(`${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`,w-85,h-14);
    screen.texture.needsUpdate=true;
  }
  const sportsAnimator=createVisibleCanvasAnimator({THREE,hz:12,draw:drawSports});
  for(const [kind,x,z,rotation]of [['basketball',-18,bounds.minZ+.3,0],['baseball',5,bounds.minZ+.3,0],['basketball',27.76,1,-Math.PI/2]]){
    const screen={kind,...canvasPanel(768,432,()=>{})};
    const frame=new THREE.Group();scene.add(frame);frame.position.set(x,3.6,z);frame.rotation.y=rotation;
    box(frame,0,0,-.07,7.4,4.2,.13,materials.black);
    const display=mesh(frame,cached('sports-tv',()=>new THREE.PlaneGeometry(7.12,4)),screen.material,0,0,.011);display.castShadow=false;dynamic(display);
    screen.texture.name=`sports-tv:${kind}:${screens.length}`;screen.texture.userData.dynamicCanvasKind='sports-tv';
    screens.push(screen);drawSports(screen,0);
    // The opaque housing covers the display's back face even though the
    // generic poster/canvas material is double-sided.
    sportsAnimator.add(screen,display,{frontOnly:true,paintedTime:0});
  }

  for(const station of facilityStations){
    const group=new THREE.Group();group.name=`facility:${station.id}`;scene.add(group);
    group.position.set(...station.setup.origin);group.rotation.y=station.setup.rotation;
    facilities.set(station.id,{station,group,type:'facility',interaction:new THREE.Vector3(...station.interaction),footprint:{w:1,d:1},update:()=>null});
  }
  const reception=createReceptionScenes({THREE,scene,materials,geometries,extraMaterials,textures,box,cylinder,sphere,rod,label,collider,volumeBox});
  const roomZones=createRoomZones({THREE,scene});
  roomZones.adoptArchitecture();

  function beginFacility(id){
    if(!facilities.has(id))return false;
    if(activeFacility&&activeFacility!==id)endFacility(activeFacility);
    activeFacility=id;doorOpen(id,true);const door=doors.get(id);if(door)door.closeAt=elapsed+1.8;
    reception.beginActivity(id);
    for(const shower of showers)shower.group.visible=shower.id===id;
    return {...facilities.get(id).station.setup,stationId:id,facilityId:id,duration:10,setupLabel:facilities.get(id).station.name};
  }
  function endFacility(id=activeFacility){
    if(!id)return;doorOpen(id,true);const door=doors.get(id);if(door)door.closeAt=elapsed+3;
    for(const shower of showers)if(shower.id===id)shower.group.visible=false;
    reception.endActivity(id);
    if(activeFacility===id)activeFacility=null;
  }
  function sampleFacility(id,phase=0,metrics){
    const facility=facilities.get(id);if(!facility)return null;
    const neutral=metrics?.neutral||{hip:[0,.934,0],shoulder:[0,1.389,0],head:[0,1.598,0],hands:[[-.27,.86,.02],[.27,.86,.02]],feet:[[-.12,0,.12],[.12,0,.12]]};
    const kind=facility.station.facilityKind;
    if(kind==='inbody'||kind==='groupClass'){
      const pose=kind==='inbody'?sampleInBodyPose(metrics||{neutral},phase):sampleGroupClassPose(metrics||{neutral},phase);
      lastPoses.set(id,pose);return pose;
    }
    if(kind==='shower'){
      const idle=buildLocomotionPose(metrics||{neutral},phase,0);
      const lifted=point=>[point[0],point[1]+.0225,point[2]];
      const pose={...idle,hip:lifted(idle.hip),shoulder:lifted(idle.shoulder),head:lifted(idle.head),
        hands:idle.hands.map(lifted),feet:idle.feet.map(lifted),gripping:false};
      lastPoses.set(id,pose);return pose;
    }
    const hipY=kind==='coldPlunge'?.415:kind==='toilet'?.53:.57;
    const torso=(neutral.shoulder[1]-neutral.hip[1])*.98;
    const headHeight=neutral.head[1]-neutral.shoulder[1];
    const pose={
      hip:[0,hipY,0],shoulder:[0,hipY+torso,-.015],head:[0,hipY+torso+headHeight,-.015],
      hands:[[-.24,hipY+.14,.28],[.24,hipY+.14,.28]],
      feet:[[-.19,kind==='coldPlunge'?.14:0,kind==='toilet'?.6:.48],[.19,kind==='coldPlunge'?.14:0,kind==='toilet'?.6:.48]],
      kneeHints:[[-.22,hipY,kind==='toilet'?.6:.47],[.22,hipY,kind==='toilet'?.6:.47]],
      elbowHints:[[-.43,hipY+.27,.09],[.43,hipY+.27,.09]],
      handNormals:[[0,-1,0],[0,-1,0]],handDirections:[[0,0,1],[0,0,1]],
      footDirections:[[0,0,1],[0,0,1]],gripping:false,relaxedHands:true,
    };
    lastPoses.set(id,pose);return pose;
  }
  function update(time,dt=.016){
    elapsed=Number.isFinite(time)?time:elapsed+dt;
    reception.update(elapsed);
    const active=facilities.get(activeFacility)?.station;
    for(const wall of walls){
      const setup=active?.setup,yaw=(setup?.rotation||0)+(setup?.cameraYaw||0);
      const dx=wall.x-(setup?.origin[0]||0),dz=wall.z-(setup?.origin[2]||0);
      const inFront=dx*Math.sin(yaw)+dz*Math.cos(yaw)>.25;
      const close=active&&Math.abs(wall.x-active.position.x)<4.3&&Math.abs(wall.z-active.position.z)<2.5;
      wall.object.material=close&&inFront?wall.cutaway:wall.material;
    }
    for(const door of doors.values()){
      door.group.visible=door.id!==activeFacility;
      if(door.closeAt!==null&&elapsed>door.closeAt){door.target=door.closed;door.closeAt=null;}
      const amount=Math.min(1,dt*6);door.group.rotation.y+=(door.target-door.group.rotation.y)*amount;
      if(door.obstruction)door.obstruction.disabled=Math.abs(door.group.rotation.y-door.closed)>.23;
    }
    if(elapsed-lastScreenTime>1/12)lastScreenTime=elapsed;
    const bathState=roomZones.getActivity().bathroom,bathUpdating=bathState.updating||roomForStation(activeFacility)==='bathroom';
    if(bathUpdating){
      bathEffectTicks++;bathElapsed=bathState.state==='unmanaged'?elapsed:bathElapsed+Math.max(0,Math.min(.05,dt));
      for(const puff of steamPuffs){
        const rise=(bathElapsed*.17+puff.offset)%1;
        puff.mesh.visible=activeFacility===puff.id||rise<.5;
        puff.mesh.position.y=.2+rise*2.2;puff.mesh.position.x=puff.baseX+Math.sin(bathElapsed*.5+puff.offset)*.16;
        puff.mesh.scale.set(1.2+rise*1.8,.55+rise*.7,1+rise);
      }
      for(const surface of waterSurfaces){surface.mesh.position.y=.66+Math.sin(bathElapsed*1.6)*.006;surface.mesh.rotation.z=Math.sin(bathElapsed*.3)*.002;}
      for(const shower of showers)if(shower.group.visible)shower.group.children.forEach((drop,index)=>{drop.scale.x=drop.scale.z=.8+Math.sin(bathElapsed*15+index)*.2;});
    }else bathSkippedTicks++;
  }
  return {
    facilities,update,beginFacility,sampleFacility,endFacility,roomZones,
    prepareRender(camera){return sportsAnimator.prepare(camera,elapsed);},
    updateRoomState(context={}){return roomZones.evaluate({...context,activeStationId:context.activeStationId||activeFacility});},
    getWorldCollisionVolumes:()=>collisionBoxes.map(volume=>({...volume,shape:'box',position:[...volume.position],size:[...volume.size],rotation:volume.rotation||[0,0,0]})),
    getSceneAnchors:()=>reception.getSceneAnchors(),getCoachRoster:()=>reception.getCoachRoster(),updateView:(camera,focus)=>reception.updateView(camera,focus),
    getActualContacts(id){const pose=lastPoses.get(id);return pose?{hands:pose.hands.map(point=>[...point]),feet:pose.feet.map(point=>[...point])}:null;},
    getCollisionVolumes(id){
      const station=facilities.get(id)?.station;if(!station)return [];
      const origin=new THREE.Vector3(...station.setup.origin),rotation=station.setup.rotation||0;
      const inverse=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-rotation);
      return collisionBoxes.filter(volume=>Math.abs(volume.position[0]-origin.x)<5&&Math.abs(volume.position[2]-origin.z)<4).map(volume=>({
        ...volume,shape:'box',position:new THREE.Vector3(...volume.position).sub(origin).applyQuaternion(inverse).toArray(),rotation:[0,-rotation,0],
      }));
    },
    toggleDoor(id,open){const door=doors.get(id);if(!door)return false;door.closeAt=null;return doorOpen(id,open??Math.abs(door.target-door.closed)<.1);},
    getDiagnostics(){const freeZone=gymLayout.zones.find(zone=>zone.id==='free-weight');return {...reception.getDiagnostics(),bounds:{...bounds},freeWeightArea:freeZone.w*freeZone.d,facilityCount:facilities.size,screenCount:screens.length,screenFrames:Math.floor(Math.max(0,lastScreenTime)*12),canvasUpdates:{sports:sportsAnimator.getDiagnostics()},posterCount:posters.length,activeFacility,roomManagement:roomZones.getDiagnostics(),bathEffects:{elapsed:bathElapsed,updated:bathEffectTicks,skipped:bathSkippedTicks},waterRunning:showers.filter(shower=>shower.group.visible).map(shower=>shower.id),doors:[...doors.values()].map(door=>({id:door.id,angle:door.group.rotation.y,open:Math.abs(door.group.rotation.y-door.closed)>.23,blocked:door.obstruction?!door.obstruction.disabled:null}))};},
    dispose(){for(const shower of showers)shower.group.visible=false;},
  };
}
