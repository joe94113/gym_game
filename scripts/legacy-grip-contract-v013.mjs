// The historical fixture stays untouched. Only this explicit adapter scope
// may differ; all other pose/frame fields and canonical physical weights are
// still compared with the source that reproduced its original full hashes.
export const CHANGED_DB_GRIPS_V013=Object.freeze(['dumbbell-curl','dumbbell-bench-press','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-romanian-deadlift']);
const fields=new Set(['hands','elbows','elbowHints','handAdvances','handFingerFlex','handThumbOpposition']);
export function protectedDumbbellPoseV013(pose,{lifecycle=false}={}){
 return Object.fromEntries(Object.entries(pose).filter(([key])=>!fields.has(key)&&!(lifecycle&&key==='handDirections')).map(([key,value])=>[key,key==='dbGearPose'?{feet:value.feet}:value]));
}
export function protectedDumbbellFrameV013(frame){return{...frame,pose:protectedDumbbellPoseV013(frame.pose,{lifecycle:true})};}
export function physicalDumbbellStateV013(rig,id){
 const root=rig.getVisualRoot(id);root.updateMatrixWorld(true);
 const weights=root.children.filter(object=>object.isGroup&&object.children.some(child=>child.geometry?.type==='CylinderGeometry'&&child.geometry.parameters.radiusTop===.016));
 if(weights.length!==(id==='dumbbell-single-arm-row'?1:2))throw Error('Missing actual physical dumbbell '+id);
 return weights.map(weight=>({matrix:weight.matrixWorld.toArray(),cylinders:weight.children.filter(child=>child.geometry?.type==='CylinderGeometry').map(child=>({position:child.position.toArray(),quaternion:child.quaternion.toArray(),scale:child.scale.toArray(),radiusTop:child.geometry.parameters.radiusTop,radiusBottom:child.geometry.parameters.radiusBottom,height:child.geometry.parameters.height}))}));
}
