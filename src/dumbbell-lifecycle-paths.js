const copy=p=>structuredClone(p),add=(a,b)=>a.map((v,i)=>v+b[i]);

/** Only the eight free-weight DB activities use these rack/carry/bench paths. */
export function buildDumbbellLifecycleNodes({record,metrics,neutral,torsoPose,gripPose,move,append,naturalPreparation=true}){
  const final=record.exercisePose,one=record.stage.weightKind==='single',goblet=record.stage.weightKind==='goblet',offset=[0,0,.80],nodes=record.nodes;
  const storage=goblet?[[-.10,1.105,1.36],[.10,1.105,1.36]]:[[-.34,.86,1.34],[.34,.86,1.34]],directions=goblet?[[0,0,1],[0,0,1]]:[[1,0,0],[-1,0,0]];
  record.storage={hands:copy(storage),handDirections:directions,feet:copy(metrics.neutral.feet)};record.weightHands=goblet?[true,true]:one?[false,true]:[true,true];
  // A hand that is not carrying a weight follows its forearm while walking.
  // Preserve the explicit downward palm frame once it supports the row bench.
  const held=(pose)=>{if(one&&!pose.handNormals?.[0]&&pose.handAdvances)pose.handAdvances[0]=null;pose.dbGripWeight=1;pose.dbNaturalGrip=1;if(!goblet)pose.dbFreeShaftWeight=1;return pose;};
  const ready=()=>{const pose=held(copy(final));if(!goblet){pose.dbFreeShaftWeight=0;pose.dbSettleToExercise=true;}return pose;};
  const put=(p,o,label,d,extra={})=>append(nodes,p,o,label,d,extra);
  put(neutral(),record.gateOffset,'站穩',0,{held:false});put(neutral(),[1.10,0,.64],'沿啞鈴架外側走近',1.6,{walk:true,held:false});put(neutral(),[0,0,.64],'走到架前',1.6,{walk:true,held:false});put(neutral(),offset,'走近啞鈴架',1.0,{walk:true,held:false});
  const hinge=torsoPose([0,.82,-.05],.65,{kneeHints:[[-.12,0,1],[.12,0,1]]}),local=storage.map(point=>point.map((v,i)=>v-offset[i]));if(one)local[0]=[-.26,.84,.08];
  const reach=(points,g=0)=>{const p=held(gripPose(hinge,points,directions,g,[[0,0,1],[0,0,1]]));p.dbNaturalGrip=0;if(!goblet)p.dbFreeShaftWeight=0;p.elbowHints=[[-.18,-1,.10],[.18,-1,.10]];if(goblet)p.handAdvances=[[1,0,0],[-1,0,0]];if(one){p.handGripping[0]=false;p.handGripStrength[0]=0;p.handAdvances[0]=null;p.elbowHints[0]=[-.5,-1,.2];}return p;};
  const approach=reach(local.map((p,i)=>record.weightHands[i]?add(p,goblet?[0,0,-.24]:[0,.16,-.08]):p)),touch=reach(local),grasp=reach(local,1);
  if(!goblet){approach.handAdvances=[null,null];grasp.dbNaturalGrip=1;}
  put(approach,offset,'屈髖伸手',1.0,{held:false});put(touch,offset,'掌心對準握把',.7,{held:false});put(grasp,offset,'握穩啞鈴',.5,{held:true});
  if(!goblet){const aligned=copy(grasp);aligned.dbNaturalGrip=1;put(aligned,offset,'提鈴前調整手腕',naturalPreparation?.18:.45,{held:true});}
  const lifted=reach(local.map((p,i)=>record.weightHands[i]?add(p,[0,goblet?.12:.07,0]):p),1);lifted.dbNaturalGrip=1;if(goblet){const upper=torsoPose([0,.90,-.03],.30);for(const k of ['hip','shoulder','head'])lifted[k]=upper[k];}put(lifted,offset,'抬離啞鈴架',.8,{held:true});
  const retracted=copy(lifted);if(!goblet)retracted.dbFreeShaftWeight=1;retracted.hip=[0,.89,-.03];const upper=torsoPose(retracted.hip,.35);retracted.shoulder=upper.shoulder;retracted.head=upper.head;retracted.hands=retracted.hands.map((p,i)=>record.weightHands[i]?add(p,[0,goblet?.075:.025,goblet?-.08:-.16]):p);put(retracted,offset,'先把啞鈴移離架面',.9,{held:true});
  const carry=held(gripPose(neutral(),goblet?[[-.10,1.30,.34],[.10,1.30,.34]]:[[-.35,.84,.08],[.35,.84,.08]],[[0,0,1],[0,0,1]],1,[[0,-1,0],[0,-1,0]]));carry.elbowHints=goblet?[[-.15,-1,.1],[.15,-1,.1]]:[[-.65,-1,.1],[.65,-1,.1]];if(goblet)carry.handAdvances=[[1,0,0],[-1,0,0]];if(one){carry.handGripping=[false,true];carry.handGripStrength=[0,1];carry.hands[0]=neutral().hands[0];carry.elbowHints[0]=[-.5,-1,.2];}
  if(!goblet){const forward=held(gripPose(neutral(),[[-.37,1.05,.32],[.37,1.05,.32]],[[1,0,0],[-1,0,0]],1,[[0,0,1],[0,0,1]]));forward.elbowHints=[[-.7,-1,.3],[.7,-1,.3]];if(one){forward.hands[0]=neutral().hands[0];forward.handGripping[0]=false;forward.handGripStrength[0]=0;}put(forward,offset,'持鈴站起',1.0,{held:true});const turned=copy(carry);turned.hands=turned.hands.map((p,i)=>record.weightHands[i]?[i?.36:-.36,.91,.08]:p);turned.elbowHints=[[-.65,-1,.1],[.65,-1,.1]];put(turned,offset,'先在身側轉成自然垂握',.8,{held:true});put(carry,offset,'放低啞鈴穩定身側',.85,{held:true});}else put(carry,offset,'持鈴站起',1.15,{held:true});
  const bench=record.id==='dumbbell-bench-press',destination=bench?[0,0,.48]:[0,0,0];put(carry,destination,'持鈴走到訓練位置',2.0,{walk:true,held:true});
  if(bench){
    const feet=copy(final.feet),standing=move(carry,[0,-.035,.48]);standing.feet=copy(feet);standing.footDirections=[[0,0,1],[0,0,1]];put(standing,[0,0,0],'調整站位',1.1,{held:true,stepFeet:true});
    // The flat pad's rounded front is lower than its plane. Sit onto the
    // actual cushion, while lowering the weights with the supported thighs.
    // Incline preparation and every canonical exercise loop stay unchanged.
    const seatedHipY=record.stage.benchAngle?.675:.645,seatedHandY=record.stage.benchAngle?.88:.862;
    const seated=held(gripPose(torsoPose([0,seatedHipY,.20],.05,{feet:copy(feet),kneeHints:[[0,1,1],[0,1,1]]}),[[-.27,seatedHandY,.48],[.27,seatedHandY,.48]],[[0,1,0],[0,1,0]],1,[[0,0,1],[0,0,1]]));seated.elbowHints=[[-.25,-1,-.6],[.25,-1,-.6]];seated.dbThighSupport=1;seated.dbFreeShaftWeight=0;
    const clearThighs=copy(standing);clearThighs.hands=[[-.42,1.05,.72],[.42,1.05,.72]];clearThighs.handDirections=[[0,.866,.5],[0,.866,.5]];clearThighs.handAdvances=[[0,-.5,.866],[0,-.5,.866]];clearThighs.elbowHints=[[-.8,-.8,.3],[.8,-.8,.3]];put(clearThighs,[0,0,0],'先提鈴離開大腿外側',1.0,{held:true});
    const nearSeat=copy(standing);nearSeat.hands=[[-.30,1.19,.76],[.30,1.19,.76]];nearSeat.handDirections=[[0,1,0],[0,1,0]];nearSeat.handAdvances=[[0,0,1],[0,0,1]];nearSeat.elbowHints=[[-.8,-.8,.4],[.8,-.8,.4]];nearSeat.dbThighSupport=1;nearSeat.dbFreeShaftWeight=0;put(nearSeat,[0,0,0],'先把啞鈴轉直靠近大腿',1.0,{held:true});
    put(seated,[0,0,0],'持鈴坐上椅墊',1.8,{held:true});put(copy(seated),[0,0,0],'啞鈴先穩放大腿上',.55,{held:true});
    const recline=held(gripPose(torsoPose([0,.675,.20],-.65,{feet:copy(feet),kneeHints:[[0,1,1],[0,1,1]]}),[[-.29,1.02,.34],[.29,1.02,.34]],[[0,1,0],[0,1,0]],1,[[0,0,1],[0,0,1]]));recline.elbowHints=[[-.2,-.5,.6],[.2,-.5,.6]];put(recline,[0,0,0],'收緊身體帶鈴慢慢後躺',1.25,{held:true});
    const lying=held(copy(final));lying.hands=[[-.30,1.02,-.05],[.30,1.02,-.05]];lying.handDirections=[[0,0,1],[0,0,1]];lying.handAdvances=[[0,1,0],[0,1,0]];lying.elbows=undefined;lying.elbowHints=[[-.3,0,.8],[.3,0,.8]];
    if(record.stage.benchAngle){const angle=record.stage.benchAngle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),rotate=p=>[p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c],pivot=final.hip;lying.hands=lying.hands.map(p=>rotate(p.map((v,i)=>v-pivot[i])).map((v,i)=>v+pivot[i]));for(const key of ['handDirections','handAdvances','elbowHints'])lying[key]=lying[key].map(rotate);}
    put(lying,[0,0,0],'背部靠穩再把啞鈴移到胸旁',1.25,{held:true});put(ready(),[0,0,0],'靠穩椅墊再抬鈴',1.0,{held:true});
  }else{
    if(record.id==='dumbbell-shoulder-press'){
      const curl=held(gripPose(neutral(),[[-.42,1.28,.40],[.42,1.28,.40]],[[0,1,0],[0,1,0]],1,[[0,0,1],[0,0,1]]));curl.elbowHints=[[-.8,-1,.1],[.8,-1,.1]];put(curl,[0,0,0],'先彎肘把啞鈴帶到身前',1.15,{held:true});
      const shoulder=held(gripPose(neutral(),[[-.47,1.53,.22],[.47,1.53,.22]],[[0,0,-1],[0,0,-1]],1,[[0,1,0],[0,1,0]]));shoulder.elbowHints=[[-1,-.4,.2],[1,-.4,.2]];put(shoulder,[0,0,0],'把啞鈴穩穩帶到肩旁',1.1,{held:true});
    }
    if(one){const before=held(copy(final));before.handNormals??=[null,null];before.handNormals[0]=null;before.handAdvances??=[null,null];before.handAdvances[0]=null;before.hands[0]=add(before.hands[0],[0,.15,0]);before.hands[1]=add(before.hands[1],[0,.08,0]);before.elbows=undefined;before.elbowHints=[[-.8,-.8,.2],[.8,-.8,.2]];put(before,[0,0,0],'屈髖並伸出支撐手',1.4,{held:true,stepFeet:true});}
    // Curl and RDL settle into their fixed exercise grip gradually. They
    // require a larger change of elbow plane than the other preparations.
    const settle=record.id==='dumbbell-curl'?2.8:record.id==='dumbbell-romanian-deadlift'?2.1:1.25;
    put(ready(),[0,0,0],one?'扶穩椅墊':'調整訓練姿勢',settle,{held:true});
  }
}
