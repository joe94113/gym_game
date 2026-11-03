const adjustment=(key,label,unit,min,max,step,defaultValue,help='')=>({key,label,unit,min,max,step,defaultValue,help});
const seat=(height)=>adjustment('seatHeightCm','座墊高度','cm',height-2,height+2,1,height,'先離開座位再調整，雙腳與握把會重新對位。');
const stack=()=>adjustment('weightKg','插銷配重','kg',5,55,5,30,'調整遊戲器材的配重插銷，不是個人建議重量。');
const plates=()=>adjustment('plateLoadKg','每側槓片','kg',0,40,1.25,10,'左右掛片同步，重量會拆成實際槓片。');
const selectors=new Set(['chestPress','shoulderPress','latPulldown','seatedRow','legExtension','legCurl','pecDeck','cableFly','lateralRaise']);
const seatedTypes=new Map([['chestPress',64],['shoulderPress',64],['latPulldown',64],['legExtension',71]]);
const plateTypes=new Set(['plateInclinePress','plateShoulderPress','plateHighRow','legPress','hackSquat','hipThrust','calfRaise','smithSquat','squat','benchPress','preacherCurl','lyingChestPress','declineChestPress']);
const machineTypes={
 'machine-chest-press':'chestPress','machine-shoulder-press':'shoulderPress','machine-lat-pulldown':'latPulldown','machine-seated-row':'seatedRow','machine-leg-extension':'legExtension','machine-leg-curl':'legCurl','machine-pec-deck':'pecDeck','machine-cable-fly':'cableFly','machine-lateral-raise':'lateralRaise',
 'machine-plate-incline-press':'plateInclinePress','machine-plate-shoulder-press':'plateShoulderPress','machine-plate-high-row':'plateHighRow','machine-leg-press':'legPress','machine-hack-squat':'hackSquat','machine-hip-thrust':'hipThrust','machine-calf-raise':'calfRaise','machine-smith-squat':'smithSquat','machine-squat-rack':'squat','machine-bench-press':'benchPress',
 'machine-preacher-curl':'preacherCurl','machine-lying-chest-press':'lyingChestPress','machine-decline-chest-press':'declineChestPress',
};
const pulleyProfiles={
 'rope-pushdown':[204,224,224], 'single-arm-cable-row':[93,113,103],
 'cable-straight-bar-curl':[16,36,16], 'cable-ez-bar-curl':[16,36,16],
 'cable-v-bar-row':[102,122,112], 'cable-rope-face-pull':[177,197,187],
 'cable-single-arm-lateral-raise':[18,38,18], 'cable-ankle-kickback':[16,36,16],
 'cable-rope-hammer-curl':[16,36,16], 'cable-straight-arm-pulldown':[204,224,224], 'cable-rope-crunch':[204,224,224],
};
export const CABLE_CALIBRATION_IDS=Object.freeze(Object.keys(pulleyProfiles));
export function machineAdjustmentsFor(type,{plateLoaded=plateTypes.has(type)}={}){
 const result=[];
 if(seatedTypes.has(type))result.push(seat(seatedTypes.get(type)));
 if(type==='latPulldown')result.push(adjustment('gripWidthCm','雙手握距','cm',76,84,2,80,'握把和掌心一起改變位置。'));
 if(type==='cableFly')result.push(adjustment('pulleyHeightCm','雙側滑輪高度','cm',156,176,5,166,'兩側滑輪、纜線與手部接點一起更新。'));
 if(selectors.has(type))result.push(stack());
 if(plateLoaded)result.push(plates());
 return result;
}
export function equipmentAdjustmentsFor(id){
 if(machineTypes[id])return machineAdjustmentsFor(machineTypes[id]);
 const range=pulleyProfiles[id];
 return range?[adjustment('pulleyHeightCm','滑輪高度','cm',range[0],range[1],5,range[2],'只開放與這個動作相容的滑輪區間。'),stack()]:[];
}
export function defaultCalibration(adjustments){return Object.fromEntries(adjustments.map(option=>[option.key,option.defaultValue]));}
export function validateCalibrationPatch(adjustments,current,patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)return null;
 const valid=new Map(adjustments.map(option=>[option.key,option]));
 for(const [key,value]of Object.entries(patch)){
  const rule=valid.get(key);
  if(!rule||typeof value!=='number'||!Number.isFinite(value)||value<rule.min||value>rule.max||Math.abs((value-rule.min)/rule.step-Math.round((value-rule.min)/rule.step))>1e-7)return null;
 }
 return{...current,...patch};
}
export function seatOffsetMeters(type,settings){const rule=machineAdjustmentsFor(type).find(item=>item.key==='seatHeightCm');return rule?(settings.seatHeightCm-rule.defaultValue)/100:0;}
export function decomposePlateLoad(kg){
 if(typeof kg!=='number'||!Number.isFinite(kg)||kg<0||kg>40||Math.abs(kg/1.25-Math.round(kg/1.25))>1e-7)return null;
 if(kg===20)return[10,10];
 let remaining=Math.round(kg*100);const result=[];
 for(const plate of [20,10,5,2.5,1.25])while(remaining>=plate*100){result.push(plate);remaining-=plate*100;}
 return result;
}

/** The cable frame's selector is a physical pin, rather than a changing label.
 * Anchor arrays are the same objects used to build the real cable segment. */
export function installCableCalibration({THREE,stage,anchor,pulleyParts=[],rod,mat}){
 const baseline=anchor[1];
 if(!pulleyParts.some(object=>(object.geometry?.parameters?.radiusTop||0)>=.08))pulleyParts=[...pulleyParts,rod(stage.group,[anchor[0]-.022,anchor[1],anchor[2]],[anchor[0]+.022,anchor[1],anchor[2]],.085,mat.rubber)];
 const parts=pulleyParts.map(object=>({object,y:object.position.y}));
 const x=.94,z=anchor[2]-.15,pin=rod(stage.group,[x-.045,.60,z],[x+.045,.60,z],.022,mat.chrome);
 pin.name='配重插銷';pin.userData.lifecycleDynamic=true;
 const slider=rod(stage.group,[anchor[0]-.055,anchor[1],anchor[2]],[anchor[0]+.055,anchor[1],anchor[2]],.035,mat.rubber);
 slider.name='可調滑輪軸';slider.userData.lifecycleDynamic=true;
 const state={pulleyHeightCm:Math.round(baseline*100),weightKg:30};
 stage.pulleyAnchor=[...anchor];
 stage.setCalibration=settings=>{
  Object.assign(state,settings);anchor[1]=state.pulleyHeightCm/100;
  for(const part of parts)part.object.position.y=part.y+anchor[1]-baseline;
  slider.position.y=anchor[1];pin.position.y=.24+(11-state.weightKg/5)*.072;
  stage.pulleyAnchor=[...anchor];stage.calibration={...state};
 };
 stage.setCalibration(state);
 stage.getCalibrationState=()=>({...state,pulleyAnchor:[...anchor],selectorPin:pin.position.toArray()});
}
