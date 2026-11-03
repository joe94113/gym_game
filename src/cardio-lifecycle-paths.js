/** Cardio-specific mounting/dismounting paths, in machine coordinates.
 * The shared authoring helpers keep actor rebasing and contact checks uniform. */
export function cardioLifecycleMetadata(type){
  if(type==='treadmill')return{gateOffset:[0,0,-1.85],gateRotation:0};
  if(type==='bike')return{gateOffset:[-1.65,0,-.25],gateRotation:-Math.PI/2};
  if(type==='elliptical')return{gateOffset:[-1.7,0,-.05],gateRotation:-Math.PI/2};
  if(type==='rower')return{gateOffset:[-1.55,0,-.05],gateRotation:-Math.PI/2};
  if(type==='stairClimber')return{gateOffset:[0,0,-2.65],gateRotation:0};
  return null;
}
export function authorCardioExit({type,ready,free,gate,metrics,body,stand,freeHands,add,walk,step,sideGateExit,clone}){
  if(type==='treadmill'){
    add(ready,free,.35,'releasing');
    const back=body([0,1.12,-.78],[[-.17,.33,-.85],[.17,.33,-.55]]);walk(free,back,1.8,{plane:.33});
    const one=body([0,.75,-1.17],[[-.17,.33,-.85],[.17,.013,-1.48]]);step(back,one,1,.24,.95,{via:[.17,.43,-1.25]});
    const down=body([0,.88,-1.45],[[-.17,.013,-1.40],[.17,.013,-1.48]]);step(one,down,0,.24,.95,{via:[-.17,.43,-1.25]});walk(down,gate,.8);
  }else if(type==='bike'){
    add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,free,.4,'releasing');
    const forward=body([0,1.18,.08],ready.feet,{axis:[0,.90,.435]});add(free,forward,.9,'standing',{free:true});
    const one=body([-.20,.90,.16],[[-.55,.013,.25],ready.feet[1]],{axis:[0,.95,.30]});step(forward,one,0,.22,1.15);
    const lifted=body([-.20,.90,.16],[one.feet[0],[.36,.82,.30]],{axis:[0,.95,.30]});lifted.kneeHints=[[0,0,1],[1,1,.3]];lifted.hands=[[-.55,1.22,.40],[.15,1.22,.40]];lifted.elbowHints=[[-1,0,1],[1,0,1]];step(one,lifted,1,.12,.65,{free:false});
    const two=body([-.60,.86,-.05],[one.feet[0],[-.65,.013,-.15]]);two.kneeHints=[[0,0,1],[0,.5,1]];two.hands=[[-.95,1.15,.30],[-.25,1.15,.30]];two.elbowHints=[[-1,0,1],[1,0,1]];step(lifted,two,1,.32,1.3,{via:[0,.90,.40],free:false});
    const released=freeHands(two);add(two,released,.5,'releasing');walk(released,gate,1.6,{lift:.28});
  }else if(type==='elliptical'){
    add(ready,free,.35,'releasing');const one=body([-.35,.75,-.58],[[-.78,.013,-.75],ready.feet[1]]);step(free,one,0,.34,1.2,{via:[-.66,.55,-.35]});
    const floor=body([-.83,.86,-.65],[one.feet[0],[-.95,.013,-.55]]);step(one,floor,1,.35,1.2,{via:[-.66,.55,-.50]});walk(floor,gate,1.5,{lift:.25});
  }else if(type==='rower'){
    add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,free,.4,'releasing');
    const one=body([-.18,.55,-.02],[[-.72,.013,-.05],ready.feet[1]],{footDirections:[[0,0,1],ready.footDirections[1]],footNormals:[[0,1,0],ready.footNormals[1]]});one.kneeHints=[[-1,.2,.2],[0,1,1]];step(free,one,0,.30,1.1,{via:[-.55,.50,.20]});
    const lifted=body([-.22,.76,-.08],[one.feet[0],[.20,.60,.427]]);lifted.kneeHints=[[-1,.2,.2],[1,1,1]];step(one,lifted,1,.12,.65);
    // Lift the foot over the rail in front of the hips. The previous rear
    // waypoint folded the ankle under its hip while the knee pole changed
    // sides, spinning the knee around the hip/ankle axis in a few frames.
    const two=body([-.48,.78,-.10],[one.feet[0],[-.60,.013,.10]]);two.kneeHints=[[-1,.2,.2],[-1,.2,.2]];step(lifted,two,1,.30,1.2,{via:[-.40,.65,.35]});
    const upright=body([-.60,.86,-.10],two.feet);add(two,upright,1.0,'standing',{free:true});walk(upright,gate,1.8,{lift:.28});
  }else if(type==='stairClimber'){
    add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,free,.45,'releasing');let p=free;
    const targets=[[[...p.feet[0]],[.18,.54,.06]],[[-.18,.34,-.32],[.18,.54,.06]],[[-.18,.34,-.32],[.18,.14,-.64]],[[-.18,.013,-1.55],[.18,.14,-.64]],[[-.18,.013,-1.55],[.18,.013,-1.70]]];
    for(let index=0;index<targets.length;index++){const feet=targets[index],height=index===4?metrics.neutral.hip[1]-.03:Math.min(...feet.map(value=>value[1]))+.75,z=(feet[0][2]+feet[1][2])/2-.10,n=body([0,height,z],feet),side=index%2?0:1;step(p,n,side,.14,.7,index>=3?{via:[side?.18:-.18,.40,-1.25]}:{});p=n;}
    walk(p,gate,1.6);
  }else return false;
  return true;
}
