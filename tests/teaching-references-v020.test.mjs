import test from 'node:test';
import assert from 'node:assert/strict';
import {activities,activityById,catalogActivities} from '../src/activity-catalog.js';
import {stations} from '../src/data.js';
import {TEACHING_REFERENCE_DATE,teachingReferenceChecks} from '../src/teaching-reference-data-v020.js';
import {
  TEACHING_SOURCE_KINDS,
  teachingReferenceFor,
  teachingReferenceMarkup,
  teachingReferenceSummary,
  withTeachingReference,
} from '../src/teaching-references-v020.js';

// Keep the public movement contract independent of the generated reference data.
// Installed duplicates and bathroom facilities are places, not extra movements.
const expectedIds=[
  'dumbbell-curl','dumbbell-bench-press','rope-pushdown','single-arm-cable-row',
  'kneeling-hip-flexor-stretch','dumbbell-hammer-curl','dumbbell-shoulder-press',
  'dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-goblet-squat',
  'dumbbell-romanian-deadlift','standing-hamstring-stretch','seated-glute-stretch',
  'standing-chest-shoulder-stretch','standing-calf-stretch','standing-thoracic-rotation',
  'cable-straight-bar-curl','cable-ez-bar-curl','cable-v-bar-row','cable-rope-face-pull',
  'cable-single-arm-lateral-raise','cable-ankle-kickback','cable-rope-hammer-curl',
  'cable-straight-arm-pulldown','cable-rope-crunch',
  'machine-chest-press','machine-lat-pulldown','machine-seated-row','machine-leg-press',
  'machine-leg-extension','machine-shoulder-press','machine-cable-fly',
  'machine-squat-rack','machine-bench-press','machine-treadmill','machine-bike',
  'machine-plate-incline-press','machine-plate-high-row','machine-plate-shoulder-press',
  'machine-hack-squat','machine-hip-thrust','machine-calf-raise','machine-smith-squat',
  'machine-leg-curl','machine-pec-deck','machine-lateral-raise','machine-elliptical',
  'machine-rower','machine-stair-climber','machine-assisted-pullup','machine-assisted-dip',
  'machine-hip-abduction','machine-hip-adduction','machine-back-extension',
  'machine-preacher-curl','machine-lying-chest-press','machine-decline-chest-press',
  'machine-reverse-fly','group-class','class-dance','class-cycle','class-trx',
  'class-barbell','class-aerial','class-pilates',
];
const sorted=values=>[...values].sort();
const meaningful=value=>typeof value==='string'&&value.trim().length>0;
const publicMovements=catalogActivities.filter(item=>item.runtime!=='facility'||item.classKind);

test('all 65 public movements have exactly one canonical reference and no facility or installed alias gets a false entry',()=>{
  assert.equal(expectedIds.length,65);
  assert.equal(new Set(expectedIds).size,65);
  assert.deepEqual(sorted(publicMovements.map(item=>item.movementId)),sorted(expectedIds));
  assert.equal(teachingReferenceChecks.length,65);
  assert.equal(new Set(teachingReferenceChecks.map(row=>row.id)).size,65);
  assert.deepEqual(sorted(teachingReferenceChecks.map(row=>row.id)),sorted(expectedIds));

  for(const id of expectedIds){
    const item=activityById(id),row=teachingReferenceFor(id);
    assert.ok(item,'missing activity '+id);
    assert.ok(row,'missing reference '+id);
    assert.equal(teachingReferenceFor(item),row,id+' object and canonical ID resolve the same record');
    assert.equal(item.source.url,row.source.url,id+' catalog exposes the preferred checked source');
  }
  for(const id of ['sauna','steam-room','cold-plunge','shower-1','toilet-1','inbody']){
    assert.equal(teachingReferenceFor(activityById(id)),null,id+' is not an exercise reference');
  }
});

test('each source has an explicit kind, dated HTTPS provenance and false professional signoff',()=>{
  assert.match(TEACHING_REFERENCE_DATE,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(TEACHING_REFERENCE_DATE).toISOString().slice(0,10),TEACHING_REFERENCE_DATE);
  const kinds=new Set(Object.keys(TEACHING_SOURCE_KINDS));
  const animationStatuses=new Set(['not-reviewed','needs-work','corrected-checked']);
  for(const row of teachingReferenceChecks){
    assert.ok(kinds.has(row.kind),row.id+' unknown source kind');
    assert.notEqual(row.kind,'unverified',row.id+' cannot silently lose its dated check');
    assert.equal(row.checkedOn,TEACHING_REFERENCE_DATE,row.id+' check date');
    assert.equal(row.professionalSignoff,false,row.id+' reading a source is not professional approval');
    assert.ok(meaningful(row.scope),row.id+' needs source scope');
    assert.ok(animationStatuses.has(row.animation?.status),row.id+' needs independent animation status');
    assert.ok(meaningful(row.animation.notes),row.id+' needs animation scope');
    assert.ok(Array.isArray(row.checkedParts),row.id+' checked parts must be explicit');
    assert.ok(Array.isArray(row.gaps),row.id+' missing stages must be explicit');
    assert.ok(Array.isArray(row.cues),row.id+' cues must be explicit');
    assert.ok(row.sources.length>0,row.id+' needs a source');
    assert.ok(row.sources.some(source=>source.url===row.source.url),row.id+' primary must be in source list');
    for(const source of row.sources){
      assert.ok(meaningful(source.label)&&meaningful(source.title),row.id+' source title and publisher');
      const url=new URL(source.url);
      assert.equal(url.protocol,'https:',row.id+' source is HTTPS');
      assert.equal(url.username,'',row.id+' no URL credentials');
      assert.equal(url.password,'',row.id+' no URL credentials');
      assert.ok(!['localhost','127.0.0.1','[::1]'].includes(url.hostname),row.id+' public source');
    }
  }
});

test('thirteen duplicate cardio installations share the canonical check without changing their interaction IDs',()=>{
  const aliasGroups={
    'machine-treadmill':['machine-treadmill-2','machine-treadmill-3','machine-treadmill-4','machine-treadmill-5','machine-treadmill-6'],
    'machine-bike':['machine-bike-2','machine-bike-3','machine-bike-4','machine-bike-5','machine-bike-6'],
    'machine-stair-climber':['machine-stair-climber-2','machine-stair-climber-3'],
    'machine-elliptical':['machine-elliptical-2'],
  };
  const aliasIds=Object.values(aliasGroups).flat();
  assert.deepEqual(sorted(activities.filter(item=>item.id!==item.movementId).map(item=>item.id)),sorted(aliasIds));
  for(const [canonical,ids] of Object.entries(aliasGroups)){
    const row=teachingReferenceFor(canonical);
    for(const id of ids){
      const item=activityById(id);
      assert.equal(item.movementId,canonical,id+' has the correct movement alias');
      assert.equal(teachingReferenceFor(item),row,id+' uses the canonical source record');
      assert.equal(item.source.url,row.source.url,id+' catalog source overlay');
      const replacement=withTeachingReference({...item,source:{label:'outdated',url:'https://example.com/outdated'}});
      assert.equal(replacement.id,id,'source replacement must not move the interaction point');
      assert.equal(replacement.stationId,item.stationId,'source replacement must not change the station');
      assert.equal(replacement.source.url,row.source.url);
      assert.match(teachingReferenceMarkup(item),new RegExp('data-teaching-reference="'+canonical+'"'));
    }
  }
});

test('summary counts public movements once, keeps seven courses and separates unresolved animation from checked sources',()=>{
  const summary=teachingReferenceSummary(catalogActivities);
  assert.equal(summary.total,65);
  assert.equal(summary.checked,65);
  assert.equal(summary.counts.unverified,0);
  assert.equal(Object.values(summary.counts).reduce((sum,count)=>sum+count,0),65);
  assert.equal(summary.animationIssues,2,'two mechanism problems remain even though sources are checked');
  assert.equal(summary.professionalSignoff,false);
  assert.equal(summary.checkedOn,TEACHING_REFERENCE_DATE);
  assert.equal(publicMovements.filter(item=>item.classKind).length,7);

  const isolated=teachingReferenceSummary([
    activityById('sauna'),
    activityById('group-class'),
    {id:'future-movement',movementId:'future-movement',runtime:'rig'},
  ]);
  assert.equal(isolated.total,2,'a classroom activity counts; a sauna does not');
  assert.equal(isolated.checked,1);
  assert.equal(isolated.counts.course_type,1);
  assert.equal(isolated.counts.unverified,1);
  assert.equal(isolated.professionalSignoff,false);
});

test('preferred sources fix dumbbell versus cable lateral raises and horizontal versus upright chest press',()=>{
  const dumbbell=teachingReferenceFor('dumbbell-lateral-raise');
  const cable=teachingReferenceFor('cable-single-arm-lateral-raise');
  assert.equal(new URL(dumbbell.source.url).pathname,'/resources/everyone/exercise-library/26/lateral-raise/');
  assert.equal(new URL(cable.source.url).pathname,'/resources/everyone/exercise-library/354/single-arm-lateral-raise/');
  assert.equal(dumbbell.kind,'direct_instruction');
  assert.equal(cable.kind,'related_variant','waist-high reference does not fully validate the low pulley variant');

  const horizontal=teachingReferenceFor('machine-lying-chest-press');
  assert.match(horizontal.source.label,/IL-HBP/,'the primary manual identifies the horizontal machine section');
  assert.equal(new URL(horizontal.source.url).hostname,'resources.lifefitness.com');
  assert.ok(horizontal.sources.some(source=>new URL(source.url).pathname.endsWith('/plate-loaded-iso-lateral-horizontal-bench-press')));
  assert.ok(horizontal.sources.every(source=>!new URL(source.url).pathname.endsWith('/plate-loaded-iso-lateral-bench-press')),'upright product must not remain the teaching source for a lying machine');
  assert.equal(activityById(horizontal.id).source.url,horizontal.source.url);
  assert.equal(horizontal.professionalSignoff,false);
});

test('partial controls, product pages, course introductions and support variants retain their limited classifications',()=>{
  const limited={
    partial_instruction:['machine-treadmill','machine-bike'],
    equipment_only:['machine-leg-press','machine-stair-climber','machine-back-extension','class-aerial'],
    course_type:['group-class','class-dance','class-cycle','class-trx','class-barbell','class-pilates'],
    related_variant:['dumbbell-single-arm-row','cable-ez-bar-curl','cable-v-bar-row','cable-single-arm-lateral-raise','machine-decline-chest-press'],
  };
  for(const [kind,ids] of Object.entries(limited)){
    for(const id of ids){
      const row=teachingReferenceFor(id);
      assert.equal(row.kind,kind,id+' may not be promoted based only on a partial or different source');
      assert.ok(row.gaps.length>0,id+' must retain coverage gaps');
      const markup=teachingReferenceMarkup(id);
      assert.ok(markup.includes(TEACHING_SOURCE_KINDS[kind]),id+' public label keeps the limitation');
      assert.ok(!markup.includes('公開教學對照 · '+TEACHING_SOURCE_KINDS.direct_instruction),id+' must not render a direct-instruction label');
      assert.equal(row.professionalSignoff,false,id);
    }
  }
});

test('leg press and elliptical remain visibly unresolved while corrected straight-arm pulldown still has no professional approval',()=>{
  const pending=['machine-leg-press','machine-elliptical'];
  for(const id of pending){
    const row=teachingReferenceFor(id);
    assert.equal(row.animation.status,'needs-work',id+' mechanism problem stays open');
    assert.match(teachingReferenceMarkup(id),/class="teaching-follow-up"/);
    assert.match(teachingReferenceMarkup(id),/動畫待修/);
    assert.equal(row.professionalSignoff,false);
  }
  assert.match(teachingReferenceFor('machine-leg-press').animation.notes,/停靠|扣件/);
  assert.match(teachingReferenceFor('machine-elliptical').animation.notes,/固定扶手/);

  const corrected=teachingReferenceFor('cable-straight-arm-pulldown');
  assert.equal(corrected.animation.status,'corrected-checked');
  assert.match(teachingReferenceMarkup(corrected.id),/動畫校正/);
  assert.doesNotMatch(teachingReferenceMarkup(corrected.id),/class="teaching-follow-up"/);
  assert.equal(corrected.professionalSignoff,false,'model correction does not become a coach signature');
  assert.equal(teachingReferenceFor('dumbbell-curl').animation.status,'not-reviewed','a normal checked source does not imply animation approval');
});

test('high row teaching uses the actual thigh support and no longer instructs the player to lean on a nonexistent chest pad',()=>{
  const station=stations.find(item=>item.id==='plate-high-row');
  const activity=activityById('machine-plate-high-row');
  for(const item of [station,activity]){
    const text=JSON.stringify({steps:item.steps,range:item.range,setupLabel:item.setupLabel});
    assert.doesNotMatch(text,/胸墊/);
    assert.match(text,/大腿墊/);
    assert.match(text,/軀幹|骨盆/);
  }
  const row=teachingReferenceFor(activity);
  assert.match(row.scope,/沒有胸墊/,'the research explanation may explicitly preserve the geometric limitation');
  assert.equal(row.animation.status,'not-reviewed','correcting copy does not silently validate the complete motion');
});

test('reference replacement preserves movement data and unknown movements never receive a fabricated source panel',()=>{
  const original=Object.freeze({
    id:'local-installation',
    movementId:'dumbbell-lateral-raise',
    stationId:'local-station',
    source:Object.freeze({label:'old',url:'https://example.com/old'}),
    muscleKeys:Object.freeze(['shoulders']),
    secondaryMuscleKeys:Object.freeze(['back']),
    customSetting:17,
  });
  const replaced=withTeachingReference(original);
  assert.notEqual(replaced,original);
  assert.equal(original.source.url,'https://example.com/old');
  assert.equal(replaced.source.url,teachingReferenceFor(original).source.url);
  assert.equal(replaced.id,original.id);
  assert.equal(replaced.stationId,original.stationId);
  assert.equal(replaced.muscleKeys,original.muscleKeys);
  assert.equal(replaced.secondaryMuscleKeys,original.secondaryMuscleKeys);
  assert.equal(replaced.customSetting,17);

  const unknown=Object.freeze({id:'unknown',source:Object.freeze({label:'unreviewed',url:'https://example.com/unknown'})});
  assert.equal(teachingReferenceFor(unknown),null);
  assert.equal(teachingReferenceMarkup(unknown),'');
  assert.equal(withTeachingReference(unknown),unknown);
  assert.equal(teachingReferenceFor(null),null);
  assert.equal(teachingReferenceMarkup(null),'');
});

test('all public source panels start collapsed and expose dated coverage plus every original source link',()=>{
  for(const row of teachingReferenceChecks){
    const markup=teachingReferenceMarkup(row.id);
    const details=markup.match(/^<details\b[^>]*>/)?.[0];
    assert.ok(details,row.id+' has a semantic expandable panel');
    assert.doesNotMatch(details,/\sopen(?:\s|=|>)/,row.id+' starts collapsed');
    assert.ok(details.includes('data-teaching-reference="'+row.id+'"'));
    assert.ok(markup.includes('公開教學對照 · '+TEACHING_SOURCE_KINDS[row.kind]));
    assert.ok(markup.includes('資料核對：'+row.checkedOn));
    assert.ok(markup.includes('來源核對與動畫檢查分開記錄。'));
    if(row.gaps.length)assert.ok(markup.includes('未涵蓋：'),row.id+' does not hide its source gaps');
    const links=[...markup.matchAll(/<a\b[^>]*>/g)].map(match=>match[0]);
    assert.equal(links.length,row.sources.length,row.id+' includes primary and supporting sources');
    for(const link of links){
      assert.match(link,/target="_blank"/);
      assert.match(link,/rel="noopener noreferrer"/);
      assert.match(link,/href="https:\/\//);
    }
  }
});
