// Extra movement definitions share a station, while each owns its attachment
// and motion. Only combinations implemented by extended-rig are listed.
const source={label:'ACE｜動作資料庫',url:'https://www.acefitness.org/resources/everyone/exercise-library/'};
const strength=(id,name,stationId,attachmentId,primary,muscleKeys,secondary,secondaryMuscleKeys,steps,options={})=>({id,name,english:id.toUpperCase().replaceAll('-',' '),stationId,attachmentId,category:'strength',side:'both',duration:6,setupLabel:options.setupLabel||name,primary,muscleKeys,secondary,secondaryMuscleKeys,steps:steps.map(([title,text])=>({title,text})),range:{start:steps[0][1],end:steps[1][1],cue:options.cue||'只做到能穩定控制的範圍。手腕保持自然，不甩動身體，也不要突然放掉重量。'},mistakes:options.mistakes||['聳肩或甩動身體借力','手腕彎折、動作速度過快','回程突然放掉重量'],source,...options});
const stretch=(id,name,primary,muscleKeys,steps,options={})=>strength(id,name,'stretch-zone','stretch-mat',primary,muscleKeys,['軀幹與四肢支撐'],['core'],steps,{category:'stretch',duration:12,setupLabel:'草皮軟墊',cue:'紅色標出伸展目標。保持呼吸，有拉伸感即可；覺得痛就退回一些，不要彈震。',mistakes:['憋氣或刻意硬壓','用腰部代償','伸展到疼痛還繼續加深'],...options});

export const extendedExercises=[
  strength('dumbbell-hammer-curl','啞鈴槌式彎舉','dumbbell-curl','dumbbells-pair',['肱二頭肌','肱肌'],['biceps'],['前臂肌群'],['forearms'],[['站穩握鈴','雙腳踩穩，兩手掌心相對，啞鈴放在身體兩側。'],['彎肘舉起','上臂靠近身體，彎曲手肘把啞鈴舉起，掌心仍然相對。'],['慢慢放下','伸直手肘回到起點，身體不要跟著前後晃動。']]),
  strength('dumbbell-shoulder-press','站姿啞鈴肩推','dumbbell-curl','dumbbells-pair',['三角肌'],['shoulders'],['肱三頭肌','腹部穩定'],['triceps','core'],[['準備推舉','啞鈴放在肩膀兩側，雙腳站穩，肋骨不要向前翻。'],['往上推','平順推向頭部上方，手肘逐漸伸展，不用腰部後仰借力。'],['回到肩側','慢慢放回肩膀兩側，保持肩部可控制的範圍。']]),
  strength('dumbbell-lateral-raise','啞鈴側平舉','dumbbell-curl','dumbbells-pair',['三角肌中束'],['shoulders'],['上背穩定肌群'],['back'],[['手臂放鬆','啞鈴放在身側，手肘微彎，肩膀放鬆。'],['向兩側抬起','手臂沿身體兩側抬起，接近肩高即可，不聳肩。'],['控制下放','保持手肘角度，慢慢把啞鈴放回身側。']]),
  strength('dumbbell-single-arm-row','單手啞鈴划船','dumbbell-curl','single-dumbbell',['背闊肌','菱形肌'],['back'],['肱二頭肌','腹部穩定'],['biceps','core'],[['扶穩訓練椅','雙腳前後站穩，一手扶在椅墊上，上身從髖部前傾，另一手握鈴。'],['手肘向後上帶','手腕保持自然，前臂大致朝下，將啞鈴帶向髖部旁，避免扭轉身體。'],['放回手臂下方','慢慢放下啞鈴，支撐手保持扶穩，背部與骨盆不要跟著晃動。']],{side:'right',setupLabel:'單手啞鈴・訓練椅支撐'}),
  strength('dumbbell-goblet-squat','啞鈴杯式深蹲','dumbbell-curl','goblet-dumbbell',['股四頭肌','臀大肌'],['quads','glutes'],['腹部與背部穩定'],['core','back'],[['抱好啞鈴','雙手將一顆啞鈴抱在胸前，雙腳略寬於髖部。'],['屈髖屈膝下蹲','臀部向後下方坐，膝蓋跟著腳尖方向移動，腳掌保持踩穩。'],['推地站起','踩穩地面站起，胸口與骨盆一起上升，不用腰部後仰。']]),
  strength('dumbbell-romanian-deadlift','啞鈴羅馬尼亞硬舉','dumbbell-curl','dumbbells-pair',['腿後側肌群','臀大肌'],['hamstrings','glutes'],['背部與腹部穩定'],['back','core'],[['站穩微屈膝','雙腳約與髖同寬，膝蓋微彎，啞鈴放在腿部兩側。'],['髖部往後送','保持背部自然，臀部向後移，上身隨髖部前傾。'],['收髖站回','感到腿後側拉伸後，踩穩地面，把髖部帶回站姿。']]),
  stretch('standing-hamstring-stretch','站姿腿後側伸展',['前側腿的腿後側肌群（伸展目標）'],['hamstrings'],[['前腳往前放','一腳往前踩穩，前腿接近伸直、膝蓋不要鎖死，後腿彎曲支撐。'],['從髖部前傾','臀部略往後，上身從髖部向前折，感受前側腿後方的拉伸，不用彎腰往下摸。'],['慢慢站回','保持自然呼吸，再慢慢回到站姿。']],{side:'right'}),
  stretch('seated-glute-stretch','坐姿臀部伸展',['臀部肌群（伸展目標）'],['glutes'],[['坐穩擺腿','坐在草皮區的低凳上，將一腳踝放在另一腿上方，雙手輕扶。'],['穩定前傾','臀部留在椅墊上，上身略向前，保持背部自然。'],['放鬆退出','不要壓膝蓋，慢慢放開雙腿並回到坐姿。']],{side:'right',setupLabel:'草皮低凳・坐姿伸展',attachmentId:'low-stretch-seat'}),
  stretch('standing-chest-shoulder-stretch','站姿胸肩伸展',['胸大肌與肩前側（伸展目標）'],['chest','shoulders'],[['穩定站立','雙腳站穩，手臂向兩側打開，手肘保留彎曲。'],['輕輕打開胸口','手臂略向後移，肩膀保持放鬆，不要拱腰。'],['手臂放回','保持呼吸，再緩慢將雙臂放回。']]),
  stretch('standing-calf-stretch','扶桿小腿伸展',['後側腿的小腿肌群（伸展目標）'],['calves'],[['前後站穩','雙手扶桿，一腳後退，後腳腳跟保持貼地。'],['身體略向前移','前膝輕彎，身體慢慢前移，感受後側小腿的拉伸。'],['退回站姿','保持呼吸，慢慢把重心帶回並收腳。']],{side:'right',attachmentId:'stretch-support'}),
  stretch('standing-thoracic-rotation','站姿胸椎轉動',['胸椎周圍肌群（活動目標）'],['back'],[['雙腳踩穩','雙腳與髖同寬，膝蓋放鬆，雙手放在胸前。'],['上背緩慢轉向側邊','骨盆大致朝前，上背緩慢轉動，視線跟著胸口移動。'],['慢慢轉回','回到中央，再在另一側重複，避免用腰部硬轉。']],{category:'mobility',duration:10}),
  strength('cable-straight-bar-curl','滑輪彎舉・直桿','cable-fly','straight-bar',['肱二頭肌'],['biceps'],['前臂握持肌群'],['forearms'],[['接好低位直桿','將直桿接到低滑輪，雙手掌心朝上握住，手肘靠近身側。'],['彎肘拉起','上臂保持穩定，彎曲手肘將直桿帶向胸前。'],['控制放回','慢慢伸展手肘，配重不要突然落下。']],{setupLabel:'低滑輪・直桿'}),
  strength('cable-ez-bar-curl','滑輪彎舉・EZ 桿','cable-fly','ez-bar',['肱二頭肌'],['biceps'],['前臂握持肌群'],['forearms'],[['握住彎折處','將 EZ 桿接到低滑輪，雙手握在彎折握位，手腕保持自然。'],['彎肘拉起','上臂靠近身體，平順彎曲手肘，不用腰背甩動。'],['慢慢放回','控制伸肘回程，手腕跟著斜握位保持穩定。']],{setupLabel:'低滑輪・EZ 桿'}),
  strength('cable-v-bar-row','滑輪划船・V 把','cable-fly','v-bar',['背闊肌','菱形肌'],['back'],['肱二頭肌','腹部穩定'],['biceps','core'],[['握好 V 把','將 V 把接到中低滑輪，雙腳站穩，兩手掌心相對。'],['拉向身體','手肘向後帶，V 把靠近上腹前方，肩膀不要聳起。'],['控制前送','手臂慢慢向前伸展，骨盆不要跟著擺動。']],{setupLabel:'中低滑輪・V 把'}),
  strength('cable-rope-face-pull','繩索面拉','cable-fly','triceps-rope',['三角肌後束','上背肌群'],['shoulders','back'],['肱二頭肌','腹部穩定'],['biceps','core'],[['繩索設在臉部上方','把繩索接到高滑輪，站穩後向前伸手握住兩端。'],['拉向臉部兩側','手肘向兩側打開，繩索分向臉旁，不要聳肩或伸頭迎繩。'],['平順放回','慢慢向前伸展手臂，保持軀幹穩定。']],{setupLabel:'高滑輪・雙頭繩索'}),
  strength('cable-single-arm-lateral-raise','單手滑輪側平舉','cable-fly','single-d-handle',['三角肌中束'],['shoulders'],['軀幹穩定'],['core'],[['接好低位單手把','將 D 形手把接到低滑輪，工作側手臂自然放在身側。'],['向側邊抬起','手肘保持微彎，向側邊抬至接近肩高，不甩動身體。'],['慢慢放回','控制手臂降回身側，肩膀不要被纜線往下拖。']],{side:'right',setupLabel:'低滑輪・D 形單手把'}),
  strength('cable-ankle-kickback','腳踝帶髖後踢','cable-fly','ankle-strap',['臀大肌'],['glutes'],['腿後側肌群','軀幹穩定'],['hamstrings','core'],[['扣好腳踝帶','將腳踝帶接到低滑輪，雙手扶穩橫桿，支撐腳踩穩。'],['從髖部向後帶腿','工作腿緩慢向後，骨盆保持朝前，不拱腰或甩腿。'],['慢慢收回','控制工作腿回到身體下方，再繼續下一次。']],{side:'right',setupLabel:'低滑輪・腳踝帶'}),
];

const specificSources={
  'dumbbell-hammer-curl':{label:'ACE｜Hammer curl',url:'https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/'},
  'dumbbell-shoulder-press':{label:'ACE｜Dumbbell shoulder press',url:'https://www.acefitness.org/resources/pros/expert-articles/9074/smart-shoulder-solutions-an-evidence-based-approach-to-training-the-deltoids/'},
  'dumbbell-lateral-raise':{label:'ACE｜側平舉（啞鈴變式參考）',url:'https://www.acefitness.org/resources/everyone/exercise-library/354/single-arm-lateral-raise/'},
  'dumbbell-single-arm-row':{label:'ACE｜單手划船（站姿支撐變式參考）',url:'https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/'},
  'dumbbell-goblet-squat':{label:'ACE｜Goblet squat',url:'https://www.acefitness.org/resources/everyone/exercise-library/362/goblet-squat/'},
  'dumbbell-romanian-deadlift':{label:'ACE｜Romanian deadlift',url:'https://www.acefitness.org/continuing-education/certified/may-2025/8865/the-ace-do-it-better-series-the-romanian-deadlift/'},
  'standing-hamstring-stretch':{label:'NHS CUH｜站姿腿後側伸展',url:'https://www.cuh.nhs.uk/patient-information/stretches-for-the-hip/'},
  'seated-glute-stretch':{label:'ACE｜坐姿臀部伸展（變式參考）',url:'https://www.acefitness.org/resources/everyone/blog/5681/3-stretches-for-opening-up-tight-hips/'},
  'standing-chest-shoulder-stretch':{label:'ACE｜站姿胸部伸展（變式參考）',url:'https://www.acefitness.org/resources/everyone/exercise-library/209/standing-chest-stretch/'},
  'standing-thoracic-rotation':{label:'ACE｜胸椎轉動（站姿變式參考）',url:'https://www.acefitness.org/resources/pros/expert-articles/5412/how-to-increase-upper-body-stability-and-mobility/'},
  'cable-straight-bar-curl':{label:'ACE｜彎舉（直桿變式參考）',url:'https://www.acefitness.org/resources/everyone/exercise-library/322/standing-bicep-curl/'},
  'cable-ez-bar-curl':{label:'ACE｜彎舉（EZ 桿變式參考）',url:'https://www.acefitness.org/resources/everyone/exercise-library/322/standing-bicep-curl/'},
  'cable-v-bar-row':{label:'NASM｜窄握划船（站姿 V 把變式參考）',url:'https://www.nasm.org/resource-center/exercise-library/seated-machine-row-close-grip'},
  'cable-rope-face-pull':{label:'NASM｜Face pull',url:'https://www.nasm.org/resource-center/exercise-library/face-pull'},
  'cable-single-arm-lateral-raise':{label:'ACE｜單手滑輪側平舉（高度變式參考）',url:'https://www.acefitness.org/resources/everyone/exercise-library/354/single-arm-lateral-raise/'},
  'cable-ankle-kickback':{label:'ACE｜Single-leg cable extension',url:'https://www.acefitness.org/resources/pros/expert-articles/6355/8-butt-toning-moves/'},
  'standing-calf-stretch':{label:'Health and Wellbeing Queensland｜小腿伸展',url:'https://hw.qld.gov.au/physical-activity/standing-calf-stretch/'},
};
for(const exercise of extendedExercises)if(specificSources[exercise.id])exercise.source=specificSources[exercise.id];
