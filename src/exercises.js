/** A movement is independent from the place and attachment used to demonstrate it. */
export const exercises = [
  {
    id: 'dumbbell-curl', name: '站姿啞鈴彎舉', english: 'STANDING DUMBBELL CURL',
    stationId: 'dumbbell-curl', category: 'strength', attachmentId: 'dumbbells-pair',
    setupLabel: '站姿・雙手啞鈴', side: 'both', duration: 5.6,
    primary: ['肱二頭肌'], secondary: ['肱肌', '前臂握持肌群'],
    muscleKeys: ['biceps'], secondaryMuscleKeys: ['forearms'],
    steps: [
      {title:'站穩握鈴',text:'雙腳踩穩，手腕保持自然平直，讓上臂靠近身體兩側。'},
      {title:'彎肘上提',text:'保持上臂大致固定，以彎曲手肘帶起啞鈴，避免抬肩或向前甩肘。'},
      {title:'平順下放',text:'緩慢伸展手肘，回到能控制的位置；軀幹保持穩定，不用腰背擺盪借力。'},
    ],
    range:{start:'手臂自然向下，啞鈴位於身側',end:'彎曲手肘，啞鈴靠近上臂前側',cue:'只在可控制、無痛的範圍內屈伸手肘，下降時也保持控制。'},
    mistakes:['甩動腰背抬起啞鈴','手肘大幅前移或聳肩','折手腕代替彎曲手肘'],
    source:{label:'Mayo Clinic｜Biceps curl',url:'https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675'},
  },
  {
    id:'dumbbell-bench-press',name:'平板啞鈴臥推',english:'FLAT DUMBBELL BENCH PRESS',
    stationId:'dumbbell-curl',category:'strength',attachmentId:'dumbbells-pair',
    setupLabel:'平板椅・雙手啞鈴',side:'both',duration:6,
    primary:['胸大肌'],secondary:['肱三頭肌','三角肌前束'],
    muscleKeys:['chest'],secondaryMuscleKeys:['triceps','shoulders'],
    steps:[
      {title:'穩定躺姿',text:'頭、上背與臀部由平板椅支撐，雙腳踩穩，握住啞鈴並保持手腕平直。'},
      {title:'向上推送',text:'平穩把啞鈴推向胸部上方，手肘逐漸伸展，避免讓肩膀向前聳起。'},
      {title:'控制回程',text:'緩慢把啞鈴降至胸部兩側，手肘沿舒適路徑彎曲，不強求過深的位置。'},
    ],
    range:{start:'啞鈴在胸側，背臀穩定貼椅',end:'啞鈴推到胸部上方，手肘自然伸展',cue:'保持肩部與手腕可控制，雙手平順移動，不讓啞鈴互撞或突然落下。'},
    mistakes:['抬起臀部或過度拱腰借力','手腕向後折、啞鈴失去穩定','回程下降過快或超過舒適範圍'],
    source:{label:'ACE｜Dumbbell chest press',url:'https://www.acefitness.org/resources/everyone/blog/3714/beginner-strength-training-workout/'},
  },
  {
    id:'rope-pushdown',name:'高位繩索三頭下壓',english:'ROPE TRICEPS PUSHDOWN',
    stationId:'cable-fly',category:'strength',attachmentId:'triceps-rope',
    setupLabel:'高滑輪・雙頭繩索',side:'both',duration:5.6,
    primary:['肱三頭肌'],secondary:['前臂握持肌群','軀幹穩定'],
    muscleKeys:['triceps'],secondaryMuscleKeys:['forearms','core'],
    steps:[
      {title:'調好高滑輪',text:'將雙頭繩索接到高位滑輪，穩定站立，手肘靠近軀幹兩側。'},
      {title:'平穩下壓',text:'以上臂穩定為前提伸展手肘，把繩索壓到身側，手腕維持自然方向。'},
      {title:'控制上回',text:'讓手肘緩慢彎曲，回到仍能維持上臂穩定的位置，避免配重突然拉回。'},
    ],
    range:{start:'手肘彎曲、繩索位於軀幹前側',end:'手肘自然伸展，繩索兩端靠近身側',cue:'動作以手肘屈伸為主，不用整個上身壓下，也不刻意把手肘向後頂死。'},
    mistakes:['肩膀與上臂前後甩動','整個身體往下壓代替伸肘','回程突然放開繩索'],
    source:{label:'ACE｜Triceps pushdowns',url:'https://www.acefitness.org/resources/everyone/exercise-library/185/triceps-pushdowns/'},
  },
  {
    id:'single-arm-cable-row',name:'單手滑輪划船',english:'SINGLE-ARM CABLE ROW',
    stationId:'cable-fly',category:'strength',attachmentId:'single-d-handle',
    setupLabel:'中低滑輪・D 形單手把',side:'right',duration:5.8,
    primary:['背闊肌','菱形肌'],secondary:['肱二頭肌','三角肌後束','軀幹穩定'],
    muscleKeys:['back'],secondaryMuscleKeys:['biceps','shoulders','core'],
    steps:[
      {title:'設定單手把',text:'把 D 形手把接到適合水平拉回的滑輪高度，雙腳穩定，軀幹保持自然直立。'},
      {title:'手肘向後帶',text:'以工作側手臂握把，讓手肘向後靠近軀幹，肩胛自然移動，避免聳肩或扭轉腰部。'},
      {title:'緩慢前送',text:'控制手臂逐漸向前伸展，腳與骨盆維持穩定，不讓纜線把身體拉走。'},
    ],
    range:{start:'工作側手臂向前握把，軀幹與骨盆穩定',end:'握把靠近軀幹，工作側手肘自然向後',cue:'讓肩胛與手肘共同完成拉回；回程維持控制，不用甩腰或過度夾背。'},
    mistakes:['用腰部旋轉代替拉回','聳肩或把頭向前伸','放回時身體被重量拖向前'],
    source:{label:'ACE｜Single arm row',url:'https://www.acefitness.org/resources/everyone/exercise-library/337/single-arm-row/'},
  },
  {
    id:'kneeling-hip-flexor-stretch',name:'跪姿髖屈肌伸展',english:'HALF-KNEELING HIP-FLEXOR STRETCH',
    stationId:'stretch-zone',category:'stretch',attachmentId:'stretch-mat',
    setupLabel:'草皮軟墊・單側髖前伸展',side:'right',duration:12,
    primary:['後側髖屈肌群（伸展目標）'],secondary:['腹部與臀部（姿勢穩定）'],
    muscleKeys:['hipFlexors'],secondaryMuscleKeys:['core','glutes'],
    steps:[
      {title:'擺好半跪姿',text:'前腳穩定踩地，後膝由軟墊支撐，後腳腳背放鬆；雙手輕放前側大腿。'},
      {title:'骨盆緩慢前移',text:'保持軀幹自然直立、腹部穩定，輕微把骨盆向前帶，感受後側髖前的伸展。'},
      {title:'平順退出',text:'在舒適範圍內停留並自然呼吸，接著緩慢回到起始姿勢，不用彈震加深。'},
    ],
    range:{start:'前腳踩穩、後膝貼墊，骨盆穩定',end:'骨盆略向前，後側髖前感到溫和伸展',cue:'紅色表示本動作的伸展目標，不是出力強度。避免拱腰、向前折腰或硬壓到底。'},
    mistakes:['用腰部後仰代替髖前伸展','前膝或骨盆向側面偏移','彈震或把伸展壓到疼痛'],
    source:{label:'ACE｜Kneeling hip-flexor stretch',url:'https://www.acefitness.org/resources/everyone/exercise-library/142/kneeling-hip-flexor-stretch/'},
  },
];

export const exerciseById = id => exercises.find(exercise => exercise.id === id);
export const exercisesForStation = stationId => exercises.filter(exercise => exercise.stationId === stationId);
