import * as THREE from 'three';
/** Isolated views keep the actual skin and fixture meshes, with consistent
 * lighting. They are an inspection tool; normal gameplay uses the gym scene. */
export function createPoseReview({renderer,scene,character,runtime,batcher}){
  const review=new THREE.Scene();review.background=new THREE.Color('#e4e7e2');review.environment=scene.environment;review.environmentIntensity=.5;
  review.add(new THREE.HemisphereLight('#ffffff','#657065',2.5));const light=new THREE.DirectionalLight('#fff3e2',3);light.position.set(-3,7,5);review.add(light);
  const camera=new THREE.PerspectiveCamera(40,1,.03,30);
  return function capture(id,view='front',size=420,pose={}){
    const roots=[character.group,...runtime.getVisualRoots(id)].filter((root,index,list)=>root&&list.indexOf(root)===index),parents=roots.map(root=>({root,parent:root.parent,index:root.parent.children.indexOf(root)}));
    const previousSize=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),shadow=renderer.shadowMap.enabled,releaseBatch=batcher?.suspendRoots(roots);
    try{
      roots.forEach(root=>review.add(root));review.updateMatrixWorld(true);
      const body=character.getContactPoints(),world=p=>character.group.localToWorld(new THREE.Vector3(...p)),hip=world(body.hips[0]).add(world(body.hips[1])).multiplyScalar(.5),shoulder=world(body.shoulders[0]).add(world(body.shoulders[1])).multiplyScalar(.5),focus=hip.clone().lerp(shoulder,.45),axis=shoulder.clone().sub(hip).normalize(),across=world(body.shoulders[1]).sub(world(body.shoulders[0])).normalize(),forward=new THREE.Vector3().crossVectors(across,axis).normalize();
      const prone=!!pose.lying||id==='class-pilates',actorForward=new THREE.Vector3(0,0,1).applyQuaternion(character.group.quaternion),direction=view==='side'?across:view==='back'?(prone?axis.clone().negate():actorForward.clone().negate()):(prone?forward:actorForward);
      camera.up.set(0,1,0);if(Math.abs(direction.y)>.85)camera.up.copy(axis);camera.position.copy(focus).addScaledVector(direction,3.65).add(new THREE.Vector3(0,prone?.25:1.25,0));camera.lookAt(focus);
      if(view.startsWith('left-hand')||view.startsWith('right-hand')){
        const side=view.startsWith('right-hand')?1:0,sideView=view.endsWith('-side'),target=world(body.hands[side]);camera.up.set(0,1,0);
        camera.position.copy(target).addScaledVector(actorForward,sideView?.05:.48).addScaledVector(across,(side?1:-1)*(sideView?.64:.34)).add(new THREE.Vector3(0,sideView?.22:.31,0));camera.lookAt(target);
      }
      renderer.setPixelRatio(1);renderer.setSize(size,size,false);renderer.shadowMap.enabled=false;renderer.render(review,camera);
      return{image:renderer.domElement.toDataURL('image/png'),view,prone};
    }finally{
      for(const record of parents){record.parent.add(record.root);record.parent.children.splice(record.parent.children.indexOf(record.root),1);record.parent.children.splice(record.index,0,record.root);}
      renderer.setPixelRatio(ratio);renderer.setSize(previousSize.x,previousSize.y,false);renderer.shadowMap.enabled=shadow;scene.updateMatrixWorld(true);releaseBatch?.();
    }
  };
}
