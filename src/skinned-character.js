import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {createNpcLodState,loadNpcLodData,createNpcGeometryLodController} from './npc-geometry-lod-v010.js';
import {consolidateActorSkeletons} from './actor-skeletons-v012.js';
import {publicAssetUrl} from './asset-url.js';

const MUSCLES = ['chest','back','shoulders','biceps','triceps','forearms','glutes','quads','hamstrings','calves','core','hipFlexors','adductors'];
const NAME = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A real, weighted human asset. The controller rotates the asset's bones;
 * it never stretches limb bones or substitutes a geometric mannequin. */
export async function createSkinnedCharacter(options) {
  const { THREE, onProgress = () => {}, modelUrl = publicAssetUrl('models/athlete/athlete.glb'), rigUrl = publicAssetUrl('models/athlete/rig.json') } = options;
  const lodState=createNpcLodState(options.lodData||null);
  if(!options.lodData&&options.lodUrl!==false){
    lodState.status='loading';
    // Optional small index data loads beside the GLB, never on its critical path.
    loadNpcLodData({url:options.lodUrl}).then(data=>{lodState.data=data;lodState.status='ready';}).catch(error=>{lodState.error=String(error.message||error);lodState.status='failed';});
  }
  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await loader.loadAsync(modelUrl, event => onProgress({ stage:'model', progress:event.total ? event.loaded/event.total : null }));
  } catch (error) {
    throw new Error(`真人模型載入失敗：${modelUrl}。${error.message}`);
  }
  let metadata = null;
  try { const response = await fetch(rigUrl); if(response.ok)metadata=await response.json(); } catch { /* Bone semantics can be recovered from the GLB itself. */ }
  // Keep an untouched skeleton for bystanders. Cloning a currently posed actor
  // would accidentally make that pose the clone's anatomical rest position.
  const template = gltf.scene;
  const resources = {geometryCache:new WeakMap(),geometries:new Set(),materials:new Set(),textures:new Set(),instances:0,disposed:false,lodState};
  function instantiate(overrides={},isClone=false) {
    if(resources.disposed)throw new Error('人物模型已經釋放，無法再建立分身。');
    const instance=createSkinnedCharacterFromModel({...options,...overrides,THREE,model:cloneSkeleton(template),metadata,sourceAsset:gltf.asset,animations:gltf.animations,sharedResources:resources,lodState,geometryLodAllowed:isClone});
    if(isClone)instance.setMuscleOverlayEnabled(false);
    instance.createClone=cloneOptions=>instantiate(cloneOptions,true);
    return instance;
  }
  const result = instantiate();
  onProgress({stage:'ready',progress:1});
  return result;
}

// Exported for asset qualification using the same controller without a network
// request. Production uses createSkinnedCharacter above.
export function createSkinnedCharacterFromModel({THREE,scene,model,metadata=null,sourceAsset=null,animations=[],geometries=new Set(),extraMaterials=new Set(),textures=new Set(),sharedResources=null,appearance={},lodData=null,lodState=sharedResources?.lodState||createNpcLodState(lodData),geometryLodAllowed=false}) {
  const group = new THREE.Group(); group.name='realistic-athlete';
  let conservativeCulling=false;
  const ownedGeometries=new Set(),ownedMaterials=new Set(),ownedTextures=new Set();
  const UP=new THREE.Vector3(0,1,0),FORWARD=new THREE.Vector3(0,0,1);
  const qIdentity=new THREE.Quaternion();
  if(sharedResources){sharedResources.instances++;sharedResources.materials??=new Set();}
  const ownGeometry=geometry=>((sharedResources?.geometries||ownedGeometries).add(geometry),geometries.add(geometry),geometry);
  const ownMaterial=material=>(ownedMaterials.add(material),sharedResources?.materials.add(material),extraMaterials.add(material),material);
  group.add(model); scene?.add(group); group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model);
  const rawHeight=bounds.max.y-bounds.min.y;
  if(!Number.isFinite(rawHeight)||rawHeight<.01)throw new Error('真人模型沒有有效的人體網格。');
  // Unit conversion is uniform for the entire imported asset, not per bone.
  if(rawHeight<1.4||rawHeight>2.2)model.scale.multiplyScalar(1.78/rawHeight);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  model.position.y-=bounds.min.y;
  group.updateMatrixWorld(true);

  const boneList=[],meshList=[];
  model.traverse(object=>{if(object.isBone)boneList.push(object);if(object.isSkinnedMesh)meshList.push(object);});
  if(!meshList.length||boneList.length<15)throw new Error('真人模型必須包含蒙皮網格與完整人體骨架。');
  const skeletonState=consolidateActorSkeletons({meshes:meshList,actorRoot:model}),uniqueSkeletons=skeletonState.skeletons;
  const bonesByName=new Map(boneList.map(bone=>[NAME(bone.name),bone]));
  const semantic=metadata?.semanticBones||metadata?.bones?.semantic||{};
  function findBone(key,names,required=true) {
    const explicit=semantic[key];
    const candidates=[...(Array.isArray(explicit)?explicit:explicit?[explicit]:[]),...names];
    for(const name of candidates){const bone=bonesByName.get(NAME(name));if(bone)return bone;}
    if(required)throw new Error(`真人模型缺少必要骨頭：${key} (${names.join(', ')})`);
    return null;
  }
  const pelvis=findBone('hips',['pelvis','hips','hip','mixamorigHips']);
  const head=findBone('head',['head','mixamorigHead']);
  const neck=findBone('neck',['neck_01','neck','mixamorigNeck'],false);
  const spineBones=[findBone('spineLower',['spine_01','spine','mixamorigSpine'],false),findBone('spineMiddle',['spine_02','spine1','mixamorigSpine1'],false),findBone('spineUpper',['spine_03','spine2','mixamorigSpine2'],false)].filter(Boolean);
  const sides=['l','r'].map(s=>({
    anatomical:s,
    upperArm:findBone(`upperArm_${s}`,[`upperarm_${s}`,`upper_arm.${s}`,`upperarm.${s}`,s==='l'?'mixamorigLeftArm':'mixamorigRightArm']),
    lowerArm:findBone(`lowerArm_${s}`,[`lowerarm_${s}`,`forearm.${s}`,`forearm_${s}`,s==='l'?'mixamorigLeftForeArm':'mixamorigRightForeArm']),
    hand:findBone(`hand_${s}`,[`hand_${s}`,`hand.${s}`,s==='l'?'mixamorigLeftHand':'mixamorigRightHand']),
    thigh:findBone(`upperLeg_${s}`,[`thigh_${s}`,`upper_leg.${s}`,`upperleg_${s}`,s==='l'?'mixamorigLeftUpLeg':'mixamorigRightUpLeg']),
    calf:findBone(`lowerLeg_${s}`,[`calf_${s}`,`shin.${s}`,`lowerleg_${s}`,s==='l'?'mixamorigLeftLeg':'mixamorigRightLeg']),
    foot:findBone(`foot_${s}`,[`foot_${s}`,`foot.${s}`,s==='l'?'mixamorigLeftFoot':'mixamorigRightFoot']),
    toe:findBone(`toe_${s}`,[`ball_${s}`,`toe.${s}`,`toe_${s}`,s==='l'?'mixamorigLeftToeBase':'mixamorigRightToeBase'],false),
  }));
  const inverseGroup=new THREE.Matrix4();
  const groupQuaternion=new THREE.Quaternion(),inverseGroupQuaternion=new THREE.Quaternion();
  // pose() synchronizes the whole actor before solving and keeps each edited
  // bone subtree current. Inside that transaction, ordinary world getters
  // would repeatedly recompose the same ancestors. Read those exact matrices
  // directly while preserving the public getters' live-transform behaviour.
  let poseMatricesCurrent=false;
  const poseGroupQuaternion=new THREE.Quaternion(),poseInverseGroupQuaternion=new THREE.Quaternion();
  const matrixPosition=new THREE.Vector3(),matrixScale=new THREE.Vector3(),parentInverse=new THREE.Matrix4();
  const positionOf=(object,out=new THREE.Vector3())=>{
    if(poseMatricesCurrent)return out.setFromMatrixPosition(object.matrixWorld).applyMatrix4(inverseGroup);
    object.getWorldPosition(out);return group.worldToLocal(out);
  };
  const quaternionOf=(object,out=new THREE.Quaternion())=>{
    if(poseMatricesCurrent){object.matrixWorld.decompose(matrixPosition,out,matrixScale);return out.premultiply(poseInverseGroupQuaternion);}
    group.getWorldQuaternion(inverseGroupQuaternion).invert();object.getWorldQuaternion(out);return out.premultiply(inverseGroupQuaternion);
  };
  const rest=new Map(boneList.map(bone=>[bone,{position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone(),worldPosition:positionOf(bone),worldQuaternion:quaternionOf(bone)}]));
  sides.sort((a,b)=>rest.get(a.upperArm).worldPosition.x-rest.get(b.upperArm).worldPosition.x);
  const restHip=rest.get(pelvis).worldPosition.clone();
  const restShoulder=rest.get(sides[0].upperArm).worldPosition.clone().add(rest.get(sides[1].upperArm).worldPosition).multiplyScalar(.5);
  const restHead=rest.get(head).worldPosition.clone();
  const restBodyAxis=restShoulder.clone().sub(restHip).normalize();
  const torsoLength=restShoulder.distanceTo(restHip);
  let maxReachError=0,primaryKeys=[],secondaryKeys=[],overlayEnabled=true;
  let bodyRotation=new THREE.Quaternion();
  const groupWorldPosition=new THREE.Vector3(),parentQ=new THREE.Quaternion(),worldQ=new THREE.Quaternion();
  function setBoneRotation(bone,rotation) {
    if(poseMatricesCurrent){
      worldQ.copy(poseGroupQuaternion).multiply(rotation);
      bone.parent.matrixWorld.decompose(matrixPosition,parentQ,matrixScale);parentQ.invert();
    }else{
      group.getWorldQuaternion(groupQuaternion);worldQ.copy(groupQuaternion).multiply(rotation);
      bone.parent.getWorldQuaternion(parentQ).invert();
    }
    bone.quaternion.copy(parentQ).multiply(worldQ);
    bone.updateMatrixWorld(true);
  }
  function setBonePosition(bone,position) {
    if(poseMatricesCurrent){
      groupWorldPosition.copy(position).applyMatrix4(group.matrixWorld);
      parentInverse.copy(bone.parent.matrixWorld).invert();groupWorldPosition.applyMatrix4(parentInverse);
    }else{group.localToWorld(groupWorldPosition.copy(position));bone.parent.worldToLocal(groupWorldPosition);}
    bone.position.copy(groupWorldPosition);bone.updateMatrixWorld(true);
  }
  const read=(value,fallback)=>new THREE.Vector3().fromArray(value||fallback);
  const restPosition=bone=>rest.get(bone).worldPosition;
  function localAt(bone,point) {return bone.worldToLocal(group.localToWorld(point.clone()));}
  function relativeScale(bone){return bone.getWorldScale(new THREE.Vector3()).divide(group.getWorldScale(new THREE.Vector3()));}
  function pointFromBone(bone,offset,out=new THREE.Vector3()) {
    if(poseMatricesCurrent)return out.copy(offset).applyMatrix4(bone.matrixWorld).applyMatrix4(inverseGroup);
    out.copy(offset);bone.localToWorld(out);return group.worldToLocal(out);
  }
  function basisQuaternion(advance,across) {
    const z=advance.clone().normalize(),x=across.clone().addScaledVector(z,-across.dot(z));
    if(x.lengthSq()<.000001)x.set(1,0,0).addScaledVector(z,-z.x);
    if(x.lengthSq()<.000001)x.set(0,1,0).addScaledVector(z,-z.y);
    x.normalize();const y=new THREE.Vector3().crossVectors(z,x).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  }
  function footBasis(forward,normal) {
    const y=normal.clone().normalize(),z=forward.clone().addScaledVector(y,-forward.dot(y));
    if(z.lengthSq()<.000001)z.set(0,0,1).addScaledVector(y,-y.z);
    if(z.lengthSq()<.000001)z.set(1,0,0).addScaledVector(y,-y.x);
    z.normalize();const x=new THREE.Vector3().crossVectors(y,z).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  }
  function fingerBone(side,finger,index) {
    return findBone(`${finger}_${index}_${side}`,[`${finger}_${String(index).padStart(2,'0')}_${side}`,`${finger}.${index}.${side}`,`${finger}${index}_${side}`],false);
  }
  for(let index=0;index<sides.length;index++) {
    const side=sides[index],s=index?1:-1;
    side.sign=s;
    side.upperLength=restPosition(side.upperArm).distanceTo(restPosition(side.lowerArm));
    side.lowerLength=restPosition(side.lowerArm).distanceTo(restPosition(side.hand));
    side.thighLength=restPosition(side.thigh).distanceTo(restPosition(side.calf));
    side.calfLength=restPosition(side.calf).distanceTo(restPosition(side.foot));
    side.fingers=[];
    for(const finger of ['thumb','index','middle','ring','pinky'])for(let digit=1;digit<=3;digit++){
      const bone=fingerBone(side.anatomical,finger,digit);
      if(bone)side.fingers.push({bone,finger,digit});
    }
    const middle=fingerBone(side.anatomical,'middle',1),indexFinger=fingerBone(side.anatomical,'index',1),pinky=fingerBone(side.anatomical,'pinky',1);
    const advance=middle?restPosition(middle).clone().sub(restPosition(side.hand)):restPosition(side.hand).clone().sub(restPosition(side.lowerArm)).normalize().multiplyScalar(.075);
    const across=indexFinger&&pinky?restPosition(indexFinger).clone().sub(restPosition(pinky)):new THREE.Vector3(0,0,-s);
    side.restHandFrame=basisQuaternion(advance,across);
    const handInv=rest.get(side.hand).worldQuaternion.clone().invert();
    side.handAdvanceLocal=advance.clone().normalize().applyQuaternion(handInv);
    side.handAcrossLocal=across.clone().normalize().applyQuaternion(handInv);
    side.handFrameLocal=basisQuaternion(side.handAdvanceLocal,side.handAcrossLocal);
    const handNormal=new THREE.Vector3().crossVectors(advance,across).normalize().multiplyScalar(s);
    // The contact represents the centre of a grasped 25–35mm handle. The palm
    // is offset outside the handle; finger bones curl around that centre.
    const measured=semantic?.[`palmOffset_${side.anatomical}`]||metadata?.contactOffsets?.[`palm_${side.anatomical}`];
    side.palmOffset=measured?new THREE.Vector3().fromArray(measured):localAt(side.hand,restPosition(side.hand).clone().addScaledVector(advance,.64).addScaledVector(handNormal,.023));
    side.palmOffsetMetres=side.palmOffset.clone().multiply(relativeScale(side.hand));
    const toe=side.toe?restPosition(side.toe).clone():restPosition(side.foot).clone().add(new THREE.Vector3(0,-.04,.15));
    const contact=toe.clone();contact.y=0.013;contact.z+=.008;
    const footOffset=metadata?.contactOffsets?.[`foot_${side.anatomical}`];
    side.footOffset=footOffset?new THREE.Vector3().fromArray(footOffset):localAt(side.foot,contact);
    side.footOffsetMetres=side.footOffset.clone().multiply(relativeScale(side.foot));
    side.restFootForward=toe.clone().sub(restPosition(side.foot));side.restFootForward.y=0;side.restFootForward.normalize();
    const footInv=rest.get(side.foot).worldQuaternion.clone().invert();
    side.footFrameLocal=footBasis(side.restFootForward.clone().applyQuaternion(footInv),UP.clone().applyQuaternion(footInv));
    for(const finger of side.fingers){
      const bone=finger.bone,child=bone.children.find(c=>c.isBone),direction=child?restPosition(child).clone().sub(restPosition(bone)):advance.clone();
      const axis=new THREE.Vector3().crossVectors(direction,handNormal).normalize();
      finger.bendAxis=axis.applyQuaternion(rest.get(bone).worldQuaternion.clone().invert());
      if(finger.finger==='thumb'&&finger.digit===1)finger.oppositionAxis=advance.clone().normalize().applyQuaternion(rest.get(bone).worldQuaternion.clone().invert());
    }
  }

  const uniformSet={
    uFormPrimaryA:{value:new THREE.Vector4(0,0,0,0)},uFormPrimaryB:{value:new THREE.Vector4(0,0,0,0)},uFormPrimaryC:{value:new THREE.Vector4(0,0,0,0)},uFormPrimaryD:{value:new THREE.Vector4(0,0,0,0)},
    uFormSecondaryA:{value:new THREE.Vector4(0,0,0,0)},uFormSecondaryB:{value:new THREE.Vector4(0,0,0,0)},uFormSecondaryC:{value:new THREE.Vector4(0,0,0,0)},uFormSecondaryD:{value:new THREE.Vector4(0,0,0,0)},
    uFormPrimaryColor:{value:new THREE.Color('#dc6855')},uFormSecondaryColor:{value:new THREE.Color('#e2a261')},uFormOverlay:{value:1},
    uFormPrimarySide:{value:0},uFormSecondarySide:{value:0},
  };
  const vertexPartCache=new WeakMap();
  function bonePart(name) {
    const n=NAME(name);
    if(/head|neck|eye|jaw|teeth|tongue/.test(n))return'head';
    if(/thumb|index|middle|ring|pinky|finger|hand/.test(n))return'hands';
    if(/foot|ball|toe/.test(n))return'feet';
    if(/upperarm|upperar|clavicle|shoulder/.test(n))return'upperArms';
    if(/lowerarm|forearm/.test(n))return'forearms';
    if(/thigh|upperleg/.test(n))return'thighs';
    if(/calf|shin|lowerleg/.test(n))return'calves';
    return'torso';
  }
  function vertexRegion(point,part) {
    if(['head','hands','feet'].includes(part))return null;
    const nearest=sides[point.x>0?1:0];
    if(part==='upperArms'){
      const a=restPosition(nearest.upperArm),b=restPosition(nearest.lowerArm),axis=b.clone().sub(a),t=THREE.MathUtils.clamp(point.clone().sub(a).dot(axis)/axis.lengthSq(),0,1);
      if(t<.24)return'shoulders';
      return point.z>a.clone().lerp(b,t).z?'biceps':'triceps';
    }
    if(part==='forearms')return'forearms';
    if(part==='thighs'){
      const a=restPosition(nearest.thigh),b=restPosition(nearest.calf);
      if(point.y>a.y-.08&&point.z<a.z-.025)return'glutes';
      const t=THREE.MathUtils.clamp((a.y-point.y)/(a.y-b.y),0,1);
      const axis=a.clone().lerp(b,t),region=point.z>axis.z-.01?(t<.23?['quads','hipFlexors']:['quads']):['hamstrings'];
      if(t>.12&&t<.85&&Math.abs(point.x)<Math.abs(axis.x)-.018)region.push('adductors');
      return region;
    }
    if(part==='calves')return point.z<restPosition(nearest.calf).z+.025?'calves':null;
    const relative=(point.y-restHip.y)/torsoLength;
    if(relative<.14)return point.z<restHip.z?'glutes':Math.abs(point.x)>.045?['core','hipFlexors']:'core';
    const front=point.z>restHip.clone().lerp(restShoulder,THREE.MathUtils.clamp(relative,0,1)).z;
    if(!front)return'back';
    if(relative>.57&&Math.abs(point.x)<Math.abs(restPosition(sides[1].upperArm).x)*1.05)return'chest';
    if(relative>.95)return'shoulders';
    return'core';
  }
  function shapeNpcSurface(point,part) {
    const feminine=appearance.bodyProfile==='feminine';
    const senior=Number(appearance.age)>=55;
    if(!feminine&&!senior)return false;
    const band=(value,centre,radius)=>Math.max(0,1-Math.abs(value-centre)/radius);
    if(feminine){
      if(part==='head'&&point.z>.025){const jaw=band(point.y,1.565,.085);point.x*=1-jaw*.075;}
      if(part==='torso'){
        const waist=band(point.y,1.075,.15),hip=band(point.y,.91,.14);
        point.x*=1-waist*.055+hip*.07;
        if(point.z>.02&&Math.abs(point.x)<.17)point.z+=band(point.y,1.275,.095)*band(Math.abs(point.x),.085,.085)*.019;
      }
      if(part==='thighs')point.x*=1+band(point.y,.81,.13)*.025;
    }
    if(senior&&part==='head'&&point.z>.04){
      const cheek=band(point.y,1.585,.052)*band(Math.abs(point.x),.065,.055);
      point.y-=cheek*.005;
      const forehead=band(point.y,1.682,.032)*Math.max(0,1-Math.abs(point.x)/.12);
      point.z+=forehead*Math.sin(point.y*620)*.00065;
    }
    return true;
  }
  function addMuscleMask(mesh) {
    const variant=`${appearance.bodyProfile||'default'}:${Number(appearance.age)>=55?'senior':'adult'}`;
    const sourceGeometry=mesh.geometry,variants=sharedResources?.geometryCache.get(sourceGeometry),cached=variants?.get(variant);
    const geometry=cached?.geometry||ownGeometry(sourceGeometry.clone());mesh.geometry=geometry;
    const position=geometry.getAttribute('position'),indices=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight');
    if(!indices||!weights)return;
    let parts=cached?.parts;
    if(!cached){
      const arrays=Array.from({length:4},()=>new Float32Array(position.count*4)),sideCoordinates=new Float32Array(position.count);parts=[];
      const point=new THREE.Vector3();
      const inverse=group.matrixWorld.clone().invert();
      const groupToMesh=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld).invert();
      for(let i=0;i<position.count;i++){
      let strongest=-1,dominant=0;
      for(let component=0;component<4;component++){const w=weights.getComponent(i,component);if(w>strongest){strongest=w;dominant=indices.getComponent(i,component);}}
      const dominantName=mesh.skeleton.bones[dominant]?.name;
      const part=bonePart(dominantName);
      point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      if(shapeNpcSurface(point,part)){
        const local=point.clone().applyMatrix4(groupToMesh);position.setXYZ(i,local.x,local.y,local.z);
      }
      sideCoordinates[i]=point.x;
      const side=point.x<0?'left':'right';
      const bodyParts={upperArms:`${side}UpperArm`,forearms:`${side}Forearm`,hands:`${side}Hand`,thighs:`${side}Thigh`,calves:`${side}Shin`,feet:`${side}Foot`};
      parts.push({part:bodyParts[part]||(part==='torso'&&/pelvis|hips|root/.test(NAME(dominantName))?'pelvis':part),regionPart:part});
      const regionKeys=vertexRegion(point,part);
      for(const key of Array.isArray(regionKeys)?regionKeys:[regionKeys]){
        const region=MUSCLES.indexOf(key);
        if(region>=0)arrays[Math.floor(region/4)][i*4+region%4]=1;
      }
      }
      ['formMuscleA','formMuscleB','formMuscleC','formMuscleD'].forEach((key,index)=>geometry.setAttribute(key,new THREE.BufferAttribute(arrays[index],4)));
      geometry.setAttribute('formMuscleSide',new THREE.BufferAttribute(sideCoordinates,1));
      if(appearance.bodyProfile==='feminine'||Number(appearance.age)>=55){position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();}
      if(sharedResources){let entries=variants;if(!entries){entries=new Map();sharedResources.geometryCache.set(sourceGeometry,entries);}entries.set(variant,{geometry,parts});}
    }
    vertexPartCache.set(mesh,parts);
    const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const patched=originals.map(original=>{
      const material=ownMaterial(original.clone());
      for(const value of Object.values(material))if(value?.isTexture){(sharedResources?.textures||ownedTextures).add(value);textures.add(value);}
      const materialName=NAME(`${mesh.name} ${material.name}`);
      // The asset's `short01` material is a short haircut, not its shorts.
      const isHair=/short01|hair/.test(materialName),isSkin=materialName.endsWith('body');
      const tint=/tank|shirt|vest|wifebeater/.test(materialName)?appearance.shirt:/compressionfabric|shorts|pants|trouser/.test(materialName)?appearance.shorts:/shoe|sneaker/.test(materialName)?appearance.shoes:isSkin?appearance.skin:isHair?appearance.hair:null;
      if(tint&&material.color)material.color.multiply(new THREE.Color(tint));
      if(isSkin&&Number(appearance.age)>=55)material.roughness=Math.max(.86,material.roughness||0);
      const hairUniforms={uFormHairGray:{value:isHair?Math.max(0,Math.min(1,appearance.grayHair||0)):0},uFormHairColor:{value:new THREE.Color(appearance.hair||'#b9b9b0')}};
      if(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial){
        material.onBeforeCompile=shader=>{
          Object.assign(shader.uniforms,uniformSet,hairUniforms);
          shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nattribute vec4 formMuscleA;\nattribute vec4 formMuscleB;\nattribute vec4 formMuscleC;\nattribute vec4 formMuscleD;\nattribute float formMuscleSide;\nvarying vec4 vFormMuscleA;\nvarying vec4 vFormMuscleB;\nvarying vec4 vFormMuscleC;\nvarying vec4 vFormMuscleD;\nvarying float vFormMuscleSide;`)
            .replace('#include <begin_vertex>',`#include <begin_vertex>\nvFormMuscleA=formMuscleA;vFormMuscleB=formMuscleB;vFormMuscleC=formMuscleC;vFormMuscleD=formMuscleD;vFormMuscleSide=formMuscleSide;`);
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec4 vFormMuscleA;\nvarying vec4 vFormMuscleB;\nvarying vec4 vFormMuscleC;\nvarying vec4 vFormMuscleD;\nvarying float vFormMuscleSide;\nuniform vec4 uFormPrimaryA;uniform vec4 uFormPrimaryB;uniform vec4 uFormPrimaryC;uniform vec4 uFormPrimaryD;\nuniform vec4 uFormSecondaryA;uniform vec4 uFormSecondaryB;uniform vec4 uFormSecondaryC;uniform vec4 uFormSecondaryD;\nuniform vec3 uFormPrimaryColor;uniform vec3 uFormSecondaryColor;uniform float uFormOverlay;uniform float uFormPrimarySide;uniform float uFormSecondarySide;`)
            .replace('#include <color_fragment>',`#include <color_fragment>\nfloat formMainSide=abs(uFormPrimarySide)<0.5?1.0:smoothstep(-0.008,0.025,vFormMuscleSide*uFormPrimarySide);\nfloat formAssistSide=abs(uFormSecondarySide)<0.5?1.0:smoothstep(-0.008,0.025,vFormMuscleSide*uFormSecondarySide);\nfloat formMain=clamp(dot(vFormMuscleA,uFormPrimaryA)+dot(vFormMuscleB,uFormPrimaryB)+dot(vFormMuscleC,uFormPrimaryC)+dot(vFormMuscleD,uFormPrimaryD),0.0,1.0)*uFormOverlay*formMainSide;\nfloat formAssist=clamp(dot(vFormMuscleA,uFormSecondaryA)+dot(vFormMuscleB,uFormSecondaryB)+dot(vFormMuscleC,uFormSecondaryC)+dot(vFormMuscleD,uFormSecondaryD),0.0,1.0)*(1.0-formMain)*uFormOverlay*formAssistSide;\ndiffuseColor.rgb=mix(diffuseColor.rgb,mix(diffuseColor.rgb*uFormPrimaryColor*1.5,uFormPrimaryColor,0.62),formMain*0.84);\ndiffuseColor.rgb=mix(diffuseColor.rgb,mix(diffuseColor.rgb*uFormSecondaryColor*1.5,uFormSecondaryColor,0.62),formAssist*0.82);\nfloat formHairDetail=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));\ndiffuseColor.rgb=mix(diffuseColor.rgb,uFormHairColor*(0.73+0.27*formHairDetail),uFormHairGray);`);
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uFormHairGray;uniform vec3 uFormHairColor;');
        };
        material.customProgramCacheKey=()=>`form-real-human-muscle-mask-v4`;
      }
      return material;
    });
    mesh.material=Array.isArray(mesh.material)?patched:patched[0];mesh.castShadow=mesh.receiveShadow=true;
    mesh.frustumCulled=false;
  }
  const sourceGeometries=meshList.map(mesh=>mesh.geometry);
  meshList.forEach(addMuscleMask);
  const geometryLod=createNpcGeometryLodController({THREE,meshList,sourceGeometries,lodState,sharedResources,ownedGeometries,allowed:geometryLodAllowed});
  function updateCullingCentre(centre){
    for(const mesh of meshList){
      if(!mesh.boundingSphere)continue;
      mesh.boundingSphere.center.copy(mesh.worldToLocal(group.localToWorld(centre.clone())));
    }
  }

  function solveTwoBone(root,target,upper,lower,hint,trackError=true) {
    const direction=target.clone().sub(root),requested=direction.length();
    const distance=THREE.MathUtils.clamp(requested,Math.abs(upper-lower)+.00001,upper+lower-.00001);
    if(requested<.000001)direction.set(0,-1,0);else direction.multiplyScalar(1/requested);
    const end=root.clone().addScaledVector(direction,distance);
    if(trackError)maxReachError=Math.max(maxReachError,end.distanceTo(target));
    const bend=hint.clone().addScaledVector(direction,-hint.dot(direction));
    if(bend.lengthSq()<.000001)bend.copy(FORWARD).addScaledVector(direction,-direction.z);
    if(bend.lengthSq()<.000001)bend.copy(UP).addScaledVector(direction,-direction.y);
    bend.normalize();
    const a=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-a*a));
    return{joint:root.clone().addScaledVector(direction,a).addScaledVector(bend,height),end};
  }
  function aimBone(bone,child,from,to,twistTarget=null) {
    const reference=bodyRotation.clone().multiply(rest.get(bone).worldQuaternion);
    const restDirection=restPosition(child).clone().sub(restPosition(bone)).normalize().applyQuaternion(bodyRotation);
    const direction=to.clone().sub(from).normalize();
    const swing=new THREE.Quaternion().setFromUnitVectors(restDirection,direction);
    const result=swing.multiply(reference);
    if(twistTarget){
      const source=UP.clone().applyQuaternion(result).addScaledVector(direction,-UP.clone().applyQuaternion(result).dot(direction));
      const wanted=twistTarget.clone().addScaledVector(direction,-twistTarget.dot(direction));
      if(source.lengthSq()>.001&&wanted.lengthSq()>.001){source.normalize();wanted.normalize();const angle=Math.atan2(new THREE.Vector3().crossVectors(source,wanted).dot(direction),source.dot(wanted));result.premultiply(new THREE.Quaternion().setFromAxisAngle(direction,THREE.MathUtils.clamp(angle,-1.1,1.1)*.45));}
    }
    setBoneRotation(bone,result);
  }
  const contacts={hands:[],feet:[],shoulders:[],elbows:[],wrists:[],hips:[],knees:[],ankles:[]};
  const toArray=v=>v.toArray();
  function pose(p={}) {
    poseMatricesCurrent=false;
    maxReachError=0;
    for(const bone of boneList){const r=rest.get(bone);bone.position.copy(r.position);bone.quaternion.copy(r.quaternion);bone.scale.copy(r.scale);}
    group.updateWorldMatrix(true,false);
    group.updateMatrixWorld(true);
    group.getWorldQuaternion(poseGroupQuaternion);
    poseInverseGroupQuaternion.copy(poseGroupQuaternion).invert();
    inverseGroup.copy(group.matrixWorld).invert();poseMatricesCurrent=true;
    try {
    const hip=read(p.hip,restHip.toArray()),shoulder=read(p.shoulder,restShoulder.toArray());
    const axis=shoulder.clone().sub(hip).normalize();
    bodyRotation.setFromUnitVectors(restBodyAxis,axis);
    if(p.bodyQuaternion)bodyRotation.fromArray(p.bodyQuaternion);
    setBonePosition(pelvis,hip);
    setBoneRotation(pelvis,bodyRotation.clone().multiply(rest.get(pelvis).worldQuaternion));
    if(p.spineTwist||p.spineLean){
      const twistAxis=UP.clone().applyQuaternion(bodyRotation);
      spineBones.forEach((bone,index)=>{
        const portion=(index+1)/spineBones.length;
        const twist=new THREE.Quaternion().setFromAxisAngle(twistAxis,(p.spineTwist||0)*portion);
        if(p.spineLean)twist.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0).applyQuaternion(bodyRotation),p.spineLean*portion));
        setBoneRotation(bone,twist.multiply(bodyRotation.clone().multiply(rest.get(bone).worldQuaternion)));
      });
    }
    if(p.headYaw||p.headPitch){
      const look=new THREE.Quaternion().setFromEuler(new THREE.Euler(p.headPitch||0,p.headYaw||0,0,'YXZ'));
      setBoneRotation(head,bodyRotation.clone().multiply(look).multiply(bodyRotation.clone().invert()).multiply(quaternionOf(head)));
    }
    const gripping=p.gripping??!!p.hands;
    for(let index=0;index<sides.length;index++){
      const side=sides[index],s=side.sign;
      const armRoot=positionOf(side.upperArm);
      const handGripping=p.handGripping?.[index]??gripping;
      const relaxed=armRoot.clone().add(new THREE.Vector3(s*.035,-(side.upperLength+side.lowerLength+side.palmOffsetMetres.length()*.70),.025).applyQuaternion(bodyRotation));
      const handTarget=read(p.hands?.[index],relaxed.toArray());
      const targetAhead=handTarget.clone().sub(armRoot).dot(FORWARD.clone().applyQuaternion(bodyRotation))>.12;
      const defaultHint=handGripping?[s*.55,-.8,.15]:targetAhead?[s*.4,-.6,.8]:[s*.08,-.2,-1];
      const armHint=p.elbows?.[index]?read(p.elbows[index]).sub(armRoot):read(p.elbowHints?.[index],defaultHint).applyQuaternion(p.elbowHints? qIdentity:bodyRotation);
      const gripAxis=read(p.handDirections?.[index],[s,0,0]).normalize();
      let finalGripAxis=gripAxis;
      let elbow=positionOf(side.lowerArm),handQ=quaternionOf(side.hand),wristTarget=handTarget.clone();
      for(let iteration=0;iteration<16;iteration++){
        const advance=handTarget.clone().sub(elbow).normalize();
        // An open support hand can extend at the wrist while its palm lies
        // flat on a bench. Omitted overrides keep the existing forearm axis.
        if(p.handAdvances?.[index]){
          const supportDirection=read(p.handAdvances[index]);
          if(supportDirection.lengthSq()>1e-10)advance.copy(supportDirection).normalize();
        }
        const palmNormal=p.handNormals?.[index]?read(p.handNormals[index]).multiplyScalar(s):null;
        const across=palmNormal?new THREE.Vector3().crossVectors(palmNormal,advance).normalize():gripAxis;
        finalGripAxis=across;
        handQ=basisQuaternion(advance,across).multiply(side.handFrameLocal.clone().invert());
        wristTarget.copy(handTarget).sub(side.palmOffsetMetres.clone().applyQuaternion(handQ));
        const solved=solveTwoBone(armRoot,wristTarget,side.upperLength,side.lowerLength,armHint,false);
        const stable=elbow.distanceToSquared(solved.joint)<1e-12;
        elbow=solved.joint;
        if(stable)break;
      }
      const solution=solveTwoBone(armRoot,wristTarget,side.upperLength,side.lowerLength,armHint);
      aimBone(side.upperArm,side.lowerArm,armRoot,solution.joint);
      aimBone(side.lowerArm,side.hand,solution.joint,solution.end,finalGripAxis);
      setBoneRotation(side.hand,handQ);
      for(const finger of side.fingers){
        const relaxedFlex=finger.finger==='thumb'?[.20,.20,.13][finger.digit-1]:[.30,.46,.23][finger.digit-1]+(['ring','pinky'].includes(finger.finger)?.055:0);
        const resting=p.relaxedHands?relaxedFlex:finger.finger==='thumb'?.13:.12;
        const closed=finger.finger==='thumb'?.48:finger.digit===1?.68:finger.digit===2?1.12:.75;
        const gripStrength=THREE.MathUtils.clamp(p.handGripStrength?.[index]??(handGripping?1:0),0,1);
        const fingerOverride=p.handFingerFlex?.[index]?.[finger.finger]?.[finger.digit-1];
        const flex=Number.isFinite(fingerOverride)?fingerOverride:THREE.MathUtils.lerp(resting,closed,gripStrength);
        finger.bone.quaternion.copy(rest.get(finger.bone).quaternion);
        const thumbOpposition=p.handThumbOpposition?.[index];
        if(finger.finger==='thumb'&&finger.digit===1&&Number.isFinite(thumbOpposition)&&Math.abs(thumbOpposition)>1e-12)finger.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(finger.oppositionAxis,thumbOpposition));
        finger.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(finger.bendAxis,flex));
      }
      side.hand.updateMatrixWorld(true);
      const legRoot=positionOf(side.thigh);
      const footTarget=read(p.feet?.[index],pointFromBone(side.foot,side.footOffset).toArray());
      const forward=read(p.footDirections?.[index],[0,0,1]),normal=read(p.footNormals?.[index],[0,1,0]);
      const footQ=footBasis(forward,normal).multiply(side.footFrameLocal.clone().invert());
      const ankleTarget=footTarget.clone().sub(side.footOffsetMetres.clone().applyQuaternion(footQ));
      const kneeHint=p.knees?.[index]?read(p.knees[index]).sub(legRoot):read(p.kneeHints?.[index],p.lying?[0,1,0]:[0,0,1]);
      const leg=solveTwoBone(legRoot,ankleTarget,side.thighLength,side.calfLength,kneeHint);
      aimBone(side.thigh,side.calf,legRoot,leg.joint);aimBone(side.calf,side.foot,leg.joint,leg.end);setBoneRotation(side.foot,footQ);
    }
    group.updateMatrixWorld(true);
    if(conservativeCulling)updateCullingCentre(hip.clone().addScaledVector(axis,.15));
    for(const skeleton of uniqueSkeletons)skeleton.update();
    for(let index=0;index<sides.length;index++){
      const side=sides[index];
      contacts.shoulders[index]=toArray(positionOf(side.upperArm));contacts.elbows[index]=toArray(positionOf(side.lowerArm));contacts.wrists[index]=toArray(positionOf(side.hand));
      contacts.hips[index]=toArray(positionOf(side.thigh));contacts.knees[index]=toArray(positionOf(side.calf));contacts.ankles[index]=toArray(positionOf(side.foot));
      contacts.hands[index]=toArray(pointFromBone(side.hand,side.palmOffset));contacts.feet[index]=toArray(pointFromBone(side.foot,side.footOffset));
      if(p.hands?.[index])maxReachError=Math.max(maxReachError,new THREE.Vector3().fromArray(contacts.hands[index]).distanceTo(read(p.hands[index])));
      if(p.feet?.[index])maxReachError=Math.max(maxReachError,new THREE.Vector3().fromArray(contacts.feet[index]).distanceTo(read(p.feet[index])));
    }
    } finally { poseMatricesCurrent=false; }
  }
  function updateUniforms(keys,prefix) {
    const values=new Array(16).fill(0);for(const key of keys){const index=MUSCLES.indexOf(key);if(index>=0)values[index]=1;}
    ['A','B','C','D'].forEach((suffix,index)=>uniformSet[`uForm${prefix}${suffix}`].value.fromArray(values,index*4));
  }
  function setMuscleHighlights(primary=[],secondary=[],options={}) {
    primaryKeys=[...new Set(primary)].filter(key=>MUSCLES.includes(key));secondaryKeys=[...new Set(secondary)].filter(key=>MUSCLES.includes(key)&&!primaryKeys.includes(key));
    updateUniforms(primaryKeys,'Primary');updateUniforms(secondaryKeys,'Secondary');
    const sideCode=side=>side==='left'?-1:side==='right'?1:0;
    uniformSet.uFormPrimarySide.value=sideCode(options.primarySide||options.side);
    uniformSet.uFormSecondarySide.value=sideCode(options.secondarySide||options.side);
  }
  pose();
  const metrics={
    height:bounds.max.y-bounds.min.y,
    neutral:{hip:restHip.toArray(),shoulder:restShoulder.toArray(),head:restHead.toArray(),hands:contacts.hands.map(point=>[...point]),feet:contacts.feet.map(point=>[...point])},
    torsoLength,
    spine:{anchors:spineBones.map(bone=>restPosition(bone).toArray()),head:restHead.toArray()},
    footForwardOffset:sides.reduce((sum,side,index)=>sum+contacts.feet[index][2]-contacts.ankles[index][2],0)/2,
    footHeightOffset:sides.reduce((sum,side,index)=>sum+contacts.ankles[index][1]-contacts.feet[index][1],0)/2,
    arms:sides.map(side=>({upper:side.upperLength,lower:side.lowerLength,palmLength:side.palmOffsetMetres.length(),shoulderOffset:restPosition(side.upperArm).clone().sub(restShoulder).toArray(),palmOffset:side.palmOffsetMetres.toArray(),handFrameLocal:side.handFrameLocal.toArray(),anatomicalSide:side.anatomical})),
    legs:sides.map((side,index)=>({upper:side.thighLength,lower:side.calfLength,hipOffset:restPosition(side.thigh).clone().sub(restHip).toArray(),footContactOffset:new THREE.Vector3().fromArray(contacts.feet[index]).sub(new THREE.Vector3().fromArray(contacts.ankles[index])).toArray(),footContactOffsetLocal:side.footOffset.toArray(),anatomicalSide:side.anatomical})),
  };
  const info={kind:'skinned-human',modelName:model.name||'MakeHuman athlete',source:sourceAsset,metadata,metrics,skinnedMeshCount:meshList.length,boneCount:boneList.length,animationClipCount:animations.length,modelUrl:publicAssetUrl('models/athlete/athlete.glb'),appearance:{bodyProfile:appearance.bodyProfile||'default',age:appearance.age||null,grayHair:appearance.grayHair||0}};
  function getSurfaceSamples({stride=64,parts=null}={}) {
    group.updateMatrixWorld(true);for(const skeleton of uniqueSkeletons)skeleton.update();
    const samples=[],point=new THREE.Vector3();
    for(const mesh of meshList){
      if(!mesh.visible)continue;const vertexParts=vertexPartCache.get(mesh)||[],count=mesh.geometry.getAttribute('position').count;
      for(let index=0;index<count;index+=Math.max(1,stride)){
        const {part='torso',regionPart='torso'}=vertexParts[index]||{};if(parts&&!parts.includes(part)&&!parts.includes(regionPart))continue;
        mesh.getVertexPosition(index,point);mesh.localToWorld(point);group.worldToLocal(point);
        samples.push({mesh:mesh.name,part,regionPart,vertex:index,position:point.toArray()});
      }
    }
    return samples;
  }
  return {
    group,pose,setMuscleHighlights,
    getMuscleHighlights(){return{primary:[...primaryKeys],secondary:[...secondaryKeys]};},
    setMuscleOverlayEnabled(value){overlayEnabled=!!value;uniformSet.uFormOverlay.value=overlayEnabled?1:0;},
    getMuscleOverlayEnabled(){return overlayEnabled;},
    getContactPoints(){return{...Object.fromEntries(Object.entries(contacts).map(([key,value])=>[key,value.map(point=>[...point])])),maxReachError};},
    getAssetInfo(){return info;},getSurfaceSamples,
    getSkeletonDiagnostics(){return{meshCount:skeletonState.meshCount,originalSkeletonCount:skeletonState.originalSkeletonCount,uniqueSkeletonCount:uniqueSkeletons.length,mergedSkeletonCount:skeletonState.mergedSkeletonCount,boneMatrixFloats:uniqueSkeletons.reduce((sum,skeleton)=>sum+skeleton.boneMatrices.length,0),allocatedBoneTextures:uniqueSkeletons.filter(skeleton=>skeleton.boneTexture!==null).length};},
    setGeometryLod:geometryLod.setLevel,
    getGeometryLodDiagnostics:geometryLod.getDiagnostics,
    getGpuResourceProtection(){return{geometries:[...new Set([...(sharedResources?.geometries||[]),...ownedGeometries])],materials:[...new Set([...(sharedResources?.materials||[]),...ownedMaterials])],textures:[...new Set([...(sharedResources?.textures||[]),...ownedTextures])],roots:[group]};},
    setConservativeCulling(enabled=true){
      conservativeCulling=!!enabled;
      group.updateMatrixWorld(true);
      for(const mesh of meshList){
        const centre=mesh.worldToLocal(group.localToWorld(new THREE.Vector3(0,1.05,0)));
        const scale=relativeScale(mesh);
        mesh.boundingSphere=new THREE.Sphere(centre,1.30/Math.max(.00001,Math.min(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z))));
        mesh.frustumCulled=!!enabled;
      }
    },
    getHandDiagnostics(){return sides.map(side=>{
      const q=quaternionOf(side.hand),advance=side.handAdvanceLocal.clone().applyQuaternion(q).normalize(),across=side.handAcrossLocal.clone().applyQuaternion(q).normalize();
      const palmNormal=new THREE.Vector3().crossVectors(advance,across).normalize().multiplyScalar(side.sign);
      const forearm=positionOf(side.hand).sub(positionOf(side.lowerArm)).normalize();
      return{anatomicalSide:side.anatomical,advance:advance.toArray(),across:across.toArray(),palmNormal:palmNormal.toArray(),wristBendRadians:Math.acos(THREE.MathUtils.clamp(advance.dot(forearm),-1,1)),fingerCount:side.fingers.length};
    });},
    dispose(){
      if(group.userData.disposed)return;group.userData.disposed=true;group.removeFromParent();
      for(const geometry of ownedGeometries)geometry.dispose();for(const material of ownedMaterials){sharedResources?.materials.delete(material);material.dispose();}
      for(const skeleton of new Set(meshList.map(mesh=>mesh.skeleton)))skeleton.dispose();
      for(const texture of ownedTextures){texture.dispose();texture.source?.data?.close?.();}
      if(sharedResources&&--sharedResources.instances===0){
        sharedResources.disposed=true;
        for(const geometry of sharedResources.geometries)geometry.dispose();
        for(const texture of sharedResources.textures){texture.dispose();texture.source?.data?.close?.();}
      }
    },
  };
}
