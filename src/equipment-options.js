import {equipmentAdjustmentsFor} from './equipment-calibration-v013.js';
const cableFamilies=[
  {ids:['rope-pushdown'],items:[{value:'triceps-rope',label:'雙頭繩索',exerciseId:'rope-pushdown',settings:{handle:'triceps-rope'}},{value:'straight-bar',label:'直桿',exerciseId:'rope-pushdown',settings:{handle:'straight-bar'}}]},
  {ids:['cable-straight-bar-curl','cable-ez-bar-curl'],items:[{value:'straight-bar',label:'直桿',exerciseId:'cable-straight-bar-curl'},{value:'ez-bar',label:'EZ 桿',exerciseId:'cable-ez-bar-curl'}]},
  {ids:['single-arm-cable-row','cable-v-bar-row'],items:[{value:'single-d-handle',label:'D 形單手把・單手划船',exerciseId:'single-arm-cable-row'},{value:'v-bar',label:'V 把・雙手划船',exerciseId:'cable-v-bar-row'}]},
];
export const BENCH_ANGLE_RANGE=Object.freeze({min:0,max:45,step:1});
export const BENCH_ANGLES=Object.freeze(Array.from({length:46},(_,angle)=>angle));
/** Only physically calibrated combinations are offered. A handle selection
 * names the compatible movement; it never silently swaps a held prop. */
export function equipmentOptionsFor(id){
  const family=cableFamilies.find(f=>f.ids.includes(id));
  return{
    benchAngles:id==='dumbbell-bench-press'?BENCH_ANGLES.map(value=>({value,label:value===0?'平躺 0°':`上斜 ${value}°`})):[],
    benchAngleRange:id==='dumbbell-bench-press'?{...BENCH_ANGLE_RANGE}:null,
    handleOptions:family?family.items.map(item=>({...item,...(item.settings?{settings:{...item.settings}}:{})})):[],
    adjustments:equipmentAdjustmentsFor(id),
  };
}
export function equipmentPresentationFor(id,settings={}){
  if(id==='rope-pushdown'&&settings.handle==='straight-bar')return{name:'直桿三頭下壓',english:'STRAIGHT-BAR TRICEPS PUSHDOWN',attachmentId:'straight-bar',setupLabel:'高滑輪・直桿',range:{start:'正握直桿放在上腹前，手肘自然彎曲',end:'直桿壓至大腿前方，手肘保持可控制',cue:'上臂保持穩定，雙腳踩穩，不用上身壓桿，也不要突然放開握把。'},mistakes:['聳肩或甩動上臂','用整個上身往下壓桿','放回時突然鬆開握把'],steps:[
    {title:'正握並站穩',text:'雙手掌心朝下握住直桿，站穩後退半步，手肘靠近身體兩側。'},
    {title:'平穩伸肘下壓',text:'上臂保持穩定，將直桿推向大腿前方，不用整個上身往下壓。'},
    {title:'控制放回',text:'慢慢彎曲手肘，保持手腕自然，再依序靠近掛位、放手及離開。'},
  ]};
  if(id!=='dumbbell-bench-press'||!Number.isInteger(settings.benchAngle)||settings.benchAngle<=0||settings.benchAngle>45)return{};
  if(settings.benchAngle!==30){const angle=settings.benchAngle;return{name:'上斜啞鈴臥推',english:'INCLINE DUMBBELL BENCH PRESS',setupLabel:`上斜 ${angle}°・雙手啞鈴`,range:{start:`啞鈴在胸側，頭、上背與臀部靠穩 ${angle}° 椅背`,end:'啞鈴推向胸部上方，雙腳保持踩穩',cue:'靠穩椅背再推舉，肩膀和手腕保持可控制，不用抬臀或拱腰借力。'},steps:[
    {title:'坐穩再靠好椅背',text:'先坐穩，將啞鈴靠在大腿上，再慢慢後靠。頭、上背與臀部保持支撐，雙腳踩穩。'},
    {title:'平穩推向胸部上方',text:`背部留在 ${angle}° 椅背上，平順推起啞鈴，避免聳肩或折手腕。`},
    {title:'控制放回胸側',text:'慢慢將啞鈴放回胸部兩側，保持可控制的範圍，再依順序起身放回器材。'},
  ]};}
  return{name:'上斜啞鈴臥推',english:'INCLINE DUMBBELL BENCH PRESS',setupLabel:'上斜 30°・雙手啞鈴',range:{start:'啞鈴在胸側，頭、上背與臀部靠穩三十度椅背',end:'啞鈴推向胸部上方，雙腳保持踩穩',cue:'靠穩椅背再推舉，肩膀和手腕保持可控制，不用抬臀或拱腰借力。'},steps:[
    {title:'坐穩再靠好椅背',text:'先坐穩，將啞鈴靠在大腿上，再慢慢後靠。頭、上背與臀部保持支撐，雙腳踩穩。'},
    {title:'平穩推向胸部上方',text:'背部留在三十度椅背上，平順推起啞鈴，避免聳肩或折手腕。'},
    {title:'控制放回胸側',text:'慢慢將啞鈴放回胸部兩側，保持可控制的範圍，再依順序起身放回器材。'},
  ]};
}
