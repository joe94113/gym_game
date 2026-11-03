/** Calf and lateral-raise stations need their own restraint/arm-pad exits. */
export function authorAuxiliaryStrengthExit({type,ready,free,gate,metrics,body,stand,add,walk,step,clone,freeHands}){
  if(type==='lateralRaise'){
    add(ready,ready,.25,'releasing',{grip:[1,0]});add(ready,ready,.7,'positioning',{state:{open:1}});add(ready,free,.5,'releasing');
    const standing=stand(0,.38,0,metrics.neutral.hip[1]-.04,ready.feet);add(free,standing,1.1,'standing',{free:true});walk(standing,gate,2.0);return true;
  }
  if(type!=='calfRaise')return false;
  add(ready,ready,.25,'releasing',{grip:[1,0]});const hands=clone(ready);hands.hands=[[-.29,1.26,.14],[.29,1.26,.14]];delete hands.elbows;delete hands.handAdvances;hands.handGripping=[false,false];hands.handGripStrength=[0,0];add(ready,hands,.7,'releasing');add(hands,hands,.8,'positioning',{state:{open:1}});
  const left=clone(hands);left.feet[0]=[-.19,.013,.12];delete left.knees;step(hands,left,0,.16,.8);
  const floor=clone(left);floor.feet[1]=[.19,.013,.12];step(left,floor,1,.16,.8);
  const stood=stand(0,.05,0,metrics.neutral.hip[1]-.06,floor.feet);add(floor,stood,.8,'standing',{free:true});
  const first=body([-.45,.69,.05],[[-1.15,.013,.16],[.19,.013,.12]]);step(stood,first,0,.28,1.0,{free:true});
  const second=body([-.90,.80,.05],[[-1.15,.013,.16],[-.97,.013,.16]]);step(first,second,1,.42,1.0,{free:true,via:[-.90,.40,.45]});
  // Leave space for the outer change plates as well as the original pair.
  // Move the feet with the body instead of sliding both shoes sideways.
  const outside=stand(-1.55,.05);walk(second,outside,.9);
  const around=stand(-1.55,1.3);walk(outside,around,1.5);walk(around,gate,1.8);
  return true;
}
