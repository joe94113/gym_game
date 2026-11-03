/** Update animated canvas textures only when their display can be rendered.
 * Content time is supplied by the simulation; hidden screens never accumulate
 * a backlog of frames to replay when they enter the camera view again. */
export function createVisibleCanvasAnimator({THREE,hz=12,draw}){
  const entries=[],frustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();
  const normal=new THREE.Vector3(),towardCamera=new THREE.Vector3(),position=new THREE.Vector3(),cameraPosition=new THREE.Vector3();
  let preparedFrames=0,redraws=0,skippedHidden=0;
  const hierarchyVisible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
  function visible(entry,camera){
    const object=entry.object;
    if(!object||!hierarchyVisible(object))return false;
    object.updateWorldMatrix(true,false);
    if(!frustum.intersectsObject(object))return false;
    const side=Array.isArray(object.material)?THREE.DoubleSide:object.material?.side;
    if(entry.frontOnly||side!==THREE.DoubleSide){
      position.setFromMatrixPosition(object.matrixWorld);towardCamera.subVectors(cameraPosition,position);
      normal.set(0,0,1).applyMatrix3(normalMatrix.getNormalMatrix(object.matrixWorld));
      const facing=normal.dot(towardCamera);
      if(entry.frontOnly||side!==THREE.BackSide){if(facing<=0)return false;}
      else if(facing>=0)return false;
    }
    return true;
  }
  return{
    add(content,object,{frontOnly=false,paintedTime=null}={}){
      const entry={content,object,frontOnly,lastFrame:paintedTime===null?null:Math.floor(paintedTime*hz+1e-8),lastDrawTime:paintedTime,visible:null,redraws:paintedTime===null?0:1,skippedHidden:0};
      entries.push(entry);if(paintedTime!==null)redraws++;return entry;
    },
    prepare(camera,time){
      if(!camera?.projectionMatrix||!Number.isFinite(time))return 0;
      camera.updateWorldMatrix(true,false);cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(viewProjection);preparedFrames++;
      const frame=Math.floor(time*hz+1e-8);let changed=0;
      for(const entry of entries){
        entry.visible=visible(entry,camera);
        if(!entry.visible){entry.skippedHidden++;skippedHidden++;continue;}
        if(entry.lastFrame===frame)continue;
        draw(entry.content,time);entry.lastFrame=frame;entry.lastDrawTime=time;entry.redraws++;redraws++;changed++;
      }
      return changed;
    },
    getDiagnostics(){return{hz,preparedFrames,redraws,uploadRequests:redraws,skippedHidden,screens:entries.map(entry=>({kind:entry.content.kind,visible:entry.visible,redraws:entry.redraws,skippedHidden:entry.skippedHidden,lastDrawTime:entry.lastDrawTime,lastFrame:entry.lastFrame}))};},
  };
}

/** The rendered measurement bar uses its exact progress, so only truly
 * identical states are skipped; integer percentage text is not used to round
 * the bar's width. */
export function measurementCanvasKey(active,progress){
  return !active?'inactive':progress>=1?'complete':`scanning:${Math.max(0,progress)}`;
}
