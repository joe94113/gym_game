/**
 * A managed background actor is reposed by pose(), not by an AnimationMixer.
 * Between those transactions its complete model subtree is unchanged. Avoid
 * walking that subtree again on every render; keep the actor/group itself live.
 * Any future direct bone edits must call invalidate() before rendering. Public
 * skin/hand diagnostics force a full traversal independently of this contract.
 */
export function createNpcWorldMatrixCache({model,isEligible=()=>false}) {
  const original=model.updateMatrixWorld;
  const snapshot=new Float64Array(58);
  let parent=null,pivot=null,pivotX=0,pivotY=0,pivotZ=0,matrixAutoUpdate=true,matrixWorldAutoUpdate=true;
  let valid=false,enabled=true,disposed=false,poseDepth=0,diagnosticDepth=0,revision=0,snapshotRevision=-1;
  const counters={calls:0,skipped:0,propagated:0,poseTransactions:0,diagnosticTransactions:0,invalidations:0};
  function matrixSignature(matrix,offset,write){
    const elements=matrix?.elements;
    for(let i=0;i<16;i++){
      const value=elements?elements[i]:(i%5===0?1:0);
      if(write)snapshot[offset+i]=value;else if(snapshot[offset+i]!==value)return false;
    }
    return true;
  }
  function signature(write=false){
    const p=model.position,q=model.quaternion,s=model.scale;
    if(write){snapshot[0]=p.x;snapshot[1]=p.y;snapshot[2]=p.z;snapshot[3]=q.x;snapshot[4]=q.y;snapshot[5]=q.z;snapshot[6]=q.w;snapshot[7]=s.x;snapshot[8]=s.y;snapshot[9]=s.z;}
    else if(snapshot[0]!==p.x||snapshot[1]!==p.y||snapshot[2]!==p.z||snapshot[3]!==q.x||snapshot[4]!==q.y||snapshot[5]!==q.z||snapshot[6]!==q.w||snapshot[7]!==s.x||snapshot[8]!==s.y||snapshot[9]!==s.z)return false;
    return matrixSignature(model.parent?.matrixWorld,10,write)&&matrixSignature(model.matrix,26,write)&&matrixSignature(model.matrixWorld,42,write);
  }
  function remember(){
    if(disposed||poseDepth||diagnosticDepth||!enabled||!isEligible()){valid=false;return;}
    parent=model.parent;matrixAutoUpdate=model.matrixAutoUpdate;matrixWorldAutoUpdate=model.matrixWorldAutoUpdate;
    pivot=model.pivot;pivotX=pivot?.x||0;pivotY=pivot?.y||0;pivotZ=pivot?.z||0;
    signature(true);snapshotRevision=revision;valid=true;
  }
  function invalidate(){valid=false;revision++;counters.invalidations++;}
  function updateMatrixWorld(force){
    if(this!==model)return original.call(this,force);
    counters.calls++;
    if(!disposed&&enabled&&isEligible()&&!poseDepth&&!diagnosticDepth&&valid&&snapshotRevision===revision&&
       parent===model.parent&&matrixAutoUpdate===model.matrixAutoUpdate&&matrixWorldAutoUpdate===model.matrixWorldAutoUpdate&&
       pivot===model.pivot&&pivotX===(model.pivot?.x||0)&&pivotY===(model.pivot?.y||0)&&pivotZ===(model.pivot?.z||0)&&
       !model.matrixWorldNeedsUpdate&&signature()){
      counters.skipped++;return;
    }
    counters.propagated++;
    original.call(model,force);
    remember();
  }
  model.updateMatrixWorld=updateMatrixWorld;
  return {
    beginPose(){invalidate();poseDepth++;counters.poseTransactions++;},
    endPose(complete=true){poseDepth=Math.max(0,poseDepth-1);if(complete)remember();else valid=false;},
    forceDiagnostic(callback){
      invalidate();diagnosticDepth++;counters.diagnosticTransactions++;
      let complete=false;
      try{const value=callback();complete=true;return value;}
      finally{diagnosticDepth--;if(complete)remember();else valid=false;}
    },
    invalidate,
    setEnabled(value=true){enabled=!!value;invalidate();return enabled;},
    getDiagnostics(){return{...counters,enabled,eligible:!disposed&&!!isEligible(),valid,poseInProgress:poseDepth>0,poseRevision:revision,snapshotRevision,disposed};},
    dispose(){if(disposed)return;disposed=true;valid=false;if(model.updateMatrixWorld===updateMatrixWorld)model.updateMatrixWorld=original;},
  };
}
