/** A transparent, unmodified flat basic plane has only one surface.
 * Three's two-pass DoubleSide path draws one empty face pass and changes
 * material shader state twice. Keep DoubleSide, but render that surface once. */
export function optimizeFlatTransparentPlanes({THREE,scene}){
  const usages=new Map();
  scene.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material)continue;if(!usages.has(material))usages.set(material,[]);usages.get(material).push(object);
    }
  });
  const materials=[];
  for(const [material,objects]of usages){
    if(!material.isMeshBasicMaterial||!material.transparent||material.side!==THREE.DoubleSide||material.forceSinglePass||material.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile)continue;
    const flat=objects.every(object=>{
      const geometry=object.geometry,positions=geometry?.attributes?.position;
      if(geometry?.type!=='PlaneGeometry'||!positions||Object.keys(geometry.morphAttributes||{}).length)return false;
      const z=positions.getZ(0);for(let i=1;i<positions.count;i++)if(positions.getZ(i)!==z)return false;
      return true;
    });
    if(!flat)continue;material.forceSinglePass=true;material.needsUpdate=true;
    materials.push({material,objects});
  }
  return{materialCount:materials.length,planeCount:materials.reduce((n,entry)=>n+entry.objects.length,0),materials};
}
