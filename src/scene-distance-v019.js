/** Mobile background distance is a rendering budget; the complete gym graph,
 * navigation, interaction points and all near actor contacts remain present. */
export function createSceneDistanceBudget({scene,camera}){const original={far:camera.far,nearFog:scene.fog?.near,farFog:scene.fog?.far};let key='',updates=0;return{
 update({deviceTier='desktop',preference='auto',reduced=false}={}){const mobile=deviceTier==='mobile'&&preference!=='clear',next=mobile?(reduced?'mobile-reduced':'mobile'):'full';if(next===key)return;key=next;updates++;camera.far=mobile?(reduced?48:70):original.far;if(scene.fog){scene.fog.near=mobile?(reduced?28:40):original.nearFog;scene.fog.far=mobile?(reduced?44:64):original.farFog;}camera.updateProjectionMatrix();},
 diagnostics(){return{distanceBudget:key,viewDistance:camera.far,fogNear:scene.fog?.near,fogFar:scene.fog?.far,distanceUpdates:updates};},
};}
