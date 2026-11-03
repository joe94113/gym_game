// SkeletonUtils clones a Skeleton for every mesh, including meshes using the
// same GLTF skin. Share only equivalent, not-yet-uploaded skeletons within one
// actor. Every mesh keeps its own bind matrices, geometry and material.
export function consolidateActorSkeletons({meshes,actorRoot}){
 const original=[...new Set(meshes.map(mesh=>mesh.skeleton))],canonical=[],replacements=new Map();
 const inside=object=>{for(let node=object;node;node=node.parent)if(node===actorRoot)return true;return false;};
 const eligible=skeleton=>!!actorRoot&&!!skeleton&&skeleton.boneTexture===null&&Array.isArray(skeleton.bones)&&skeleton.bones.length>0&&skeleton.bones.length===skeleton.boneInverses?.length&&skeleton.bones.every(bone=>bone?.isBone&&inside(bone))&&skeleton.boneInverses.every(matrix=>matrix?.elements?.length===16&&matrix.elements.every(Number.isFinite));
 const equivalent=(a,b)=>a.constructor===b.constructor&&a.update===b.update&&a.computeBoneTexture===b.computeBoneTexture&&a.bones.length===b.bones.length&&a.bones.every((bone,index)=>bone===b.bones[index]&&a.boneInverses[index].elements.every((value,element)=>Object.is(value,b.boneInverses[index].elements[element])));
 for(const skeleton of original){
  if(!eligible(skeleton))continue;
  const same=canonical.find(candidate=>equivalent(candidate,skeleton));
  if(same)replacements.set(skeleton,same);else canonical.push(skeleton);
 }
 for(const mesh of meshes)if(inside(mesh)&&replacements.has(mesh.skeleton))mesh.skeleton=replacements.get(mesh.skeleton);
 const skeletons=[...new Set(meshes.map(mesh=>mesh.skeleton))];
 // Discarded Skeletons have no boneTexture yet. Let their unused Float32Array
 // buffers be collected; disposing a texture shared by external code is avoided
 // by refusing any skeleton that has already allocated its texture.
 return{skeletons,meshCount:meshes.length,originalSkeletonCount:original.length,mergedSkeletonCount:original.length-skeletons.length};
}
