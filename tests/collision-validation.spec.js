import {test,expect} from '@playwright/test';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';

const body={shoulders:[[-.23,1.4,0],[.23,1.4,0]],elbows:[[-.3,1.12,0],[.3,1.12,0]],wrists:[[-.3,.86,0],[.3,.86,0]],hands:[[-.3,.80,0],[.3,.80,0]],hips:[[-.11,.9,0],[.11,.9,0]],knees:[[-.12,.5,.02],[.12,.5,.02]],ankles:[[-.12,.1,0],[.12,.1,0]],feet:[[-.12,.02,.1],[.12,.02,.1]]};
test('碰撞檢查會抓到前臂穿過鋼架，即使手掌接點位於鋼架外',()=>{
  const result=evaluateExerciseClearance(body,[{id:'frame',shape:'box',position:[.30,1,0],size:[.08,.12,.08],allowedBodyParts:['rightHand']}]);
  expect(result.testedPairs).toBeGreaterThan(0);
  expect(result.collisions.some(item=>item.bodyPart==='rightForearm'&&item.volumeId==='frame')).toBe(true);
  expect(result.maxPenetration).toBeGreaterThan(.04);
});
test('明確允許的椅墊接觸不會抹掉其他禁止接觸',()=>{
  const seat={id:'seat',shape:'box',position:[0,.9,0],size:[.35,.1,.25],allowedBodyParts:['pelvis','torso']};
  const result=evaluateExerciseClearance(body,[seat]);
  expect(result.collisions.some(item=>item.bodyPart==='pelvis'||item.bodyPart==='torso')).toBe(false);
  expect(result.testedPairs).toBeGreaterThan(0);
});
test('實際蒙皮表面點也會檢出穿入物件，接觸例外按部位套用',()=>{
  const volume={id:'bar',shape:'box',position:[0,0,0],size:[.2,.2,.2],allowedBodyParts:['rightHand']};
  const result=evaluateSurfaceClearance([{mesh:'shirt',part:'rightForearm',position:[.01,.01,.01]},{mesh:'hand',part:'rightHand',position:[.01,.01,.01]}],[volume]);
  expect(result.collisions).toHaveLength(1);
  expect(result.collisions[0].mesh).toBe('shirt');
  expect(result.maxPenetration).toBeGreaterThan(.08);
});
test('前臂穿過軀幹會被自碰撞檢查抓到',()=>{
  const crossed={...body,elbows:[[-.30,1.12,-.20],[.30,1.12,0]],wrists:[[.04,1.12,.20],[.30,.86,0]],hands:[[.05,1.12,.24],[.30,.8,0]]};
  const result=evaluateSelfClearance(crossed);
  expect(result.testedPairs).toBeGreaterThan(0);expect(result.collisions.some(item=>item.bodyPart==='leftForearm'&&item.otherBodyPart==='torso')).toBe(true);
});
