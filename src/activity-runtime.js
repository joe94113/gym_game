import {activityById} from './activity-catalog.js';
import {createMachineLifecycle} from './machine-lifecycle.js';
import {createFacilityLifecycle} from './facility-lifecycle.js';
import * as THREE from 'three';
import {equipmentOptionsFor} from './equipment-options.js';

/** One interface for an exercise stage, an installed machine, or a facility. */
export function createActivityRuntime({rig,machines,architecture,metrics,groupClasses}) {
  let current=null;
  const lifecycles=new Map();
  const visibleRigs=new Map(),originalInteractions=new Map();let navigationObstacles=[];
  const definition=id=>activityById(id);
  const classroom=activity=>groupClasses&&(activity?.runtime==='class'||activity?.facilityKind==='groupClass');
  function setup(id) {
    const activity=definition(id);if(!activity)return null;
    if(classroom(activity))return groupClasses.getSetup(id);
    if(activity.runtime==='machine')return machines.get(activity.stationId)?.getSetup(id);
    if(activity.runtime==='facility'){
      const facility=architecture.facilities.get(activity.stationId);
      return {...facility?.station.setup,stationId:activity.stationId,exerciseId:id,duration:activity.duration||12};
    }
    return rig.getSetup(id);
  }
  function refreshNavigation(){
    navigationObstacles=[];
    for(const id of visibleRigs.values()){
      const placement=setup(id),yaw=placement.rotation||0,rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),origin=new THREE.Vector3(...placement.origin);
      for(const volume of rig.getNavigationVolumes?.(id)||[]){
        const bounds=new THREE.Box3();
        if(volume.shape==='box'){
          const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0]))),center=new THREE.Vector3(...volume.position);
          for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])bounds.expandByPoint(new THREE.Vector3(x*volume.size[0]/2,y*volume.size[1]/2,z*volume.size[2]/2).applyQuaternion(q).add(center).applyQuaternion(rotation).add(origin));
        }else if(volume.shape==='capsule')for(const point of [volume.start,volume.end]){const p=new THREE.Vector3(...point).applyQuaternion(rotation).add(origin),r=volume.radius;bounds.expandByPoint(p.clone().addScalar(r));bounds.expandByPoint(p.clone().addScalar(-r));}
        if(bounds.isEmpty()||bounds.max.y<origin.y+.12)continue;
        navigationObstacles.push({x:(bounds.min.x+bounds.max.x)/2,z:(bounds.min.z+bounds.max.z)/2,hx:(bounds.max.x-bounds.min.x)/2,hz:(bounds.max.z-bounds.min.z)/2});
      }
    }
  }
  return {
    getEquipmentOptions(id){const activity=definition(id);return activity?.runtime==='machine'?(machines.get(activity.stationId)?.getEquipmentOptions?.(id)||equipmentOptionsFor(id)):equipmentOptionsFor(id);},
    getEquipmentSettings(id){const activity=definition(id),machine=machines.get(activity?.stationId);return activity?.runtime==='machine'?(machine?.getEquipmentSettings?.(id)||{...(machine?.getPlateLoad?{plateLoadKg:machine.getPlateLoad()}: {})}):(rig.getEquipmentSettings?.(id)||{});},
    setEquipmentSettings(id,settings){
      if(current)return{ok:false,reason:'請先放回器材並離開，再更換設定。'};
      const activity=definition(id),machine=machines.get(activity?.stationId);let result;
      if(activity?.runtime==='machine'){
        if(machine?.setEquipmentSettings)result=machine.setEquipmentSettings(settings,id);
        else if(machine?.setPlateLoad&&Object.keys(settings).length===1&&Number.isFinite(settings.plateLoadKg)&&settings.plateLoadKg>=0&&settings.plateLoadKg<=40&&Math.abs(settings.plateLoadKg/1.25-Math.round(settings.plateLoadKg/1.25))<1e-8){machine.setPlateLoad(settings.plateLoadKg);result={ok:true,changed:true,settings:{plateLoadKg:machine.getPlateLoad()}};}
      }else result=rig.setEquipmentSettings?.(id,settings);
      result??={ok:false,reason:'這個動作沒有可調整的設定。'};
      if(result.ok){for(const key of lifecycles.keys())if(definition(key)?.stationId===activity?.stationId)lifecycles.delete(key);refreshNavigation();}return result;
    },
    prepare(id){const activity=definition(id);if(!activity||!setup(id))return false;current=activity;if(classroom(activity)){groupClasses.prepare(id);refreshNavigation();return true;}if(activity.runtime==='rig'){(rig.prepare||rig.begin).call(rig,id);visibleRigs.set(activity.stationId,id);const metadata=rig.getLifecycle(id),placement=setup(id),point=new THREE.Vector3(...metadata.gateOffset).applyAxisAngle(new THREE.Vector3(0,1,0),placement.rotation||0).add(new THREE.Vector3(...placement.origin)),machine=machines.get(activity.stationId);if(machine){if(!originalInteractions.has(activity.stationId))originalInteractions.set(activity.stationId,machine.interaction.clone());machine.interaction.copy(point);}}if(activity.runtime==='machine'){rig.hideStation?.(activity.stationId);visibleRigs.delete(activity.stationId);const machine=machines.get(activity.stationId);if(originalInteractions.has(activity.stationId))machine?.interaction.copy(originalInteractions.get(activity.stationId));machine?.beginActivity?.(id);}refreshNavigation();return true;},
    begin(id){if(current?.id!==id)this.prepare(id);const activity=definition(id);if(classroom(activity))groupClasses.begin(id);if(activity?.runtime==='facility'||activity?.runtime==='class')architecture.beginFacility(activity.stationId);if(activity?.runtime==='machine')machines.get(activity.stationId)?.beginExercise?.(id);return !!activity;},
    end(){if(classroom(current))groupClasses.end();if(current?.runtime==='rig')rig.end({keepVisible:true});if(current?.runtime==='facility'||current?.runtime==='class')architecture.endFacility(current.stationId);if(current?.runtime==='machine')machines.get(current.stationId)?.endActivity?.();current=null;},
    getLifecycle(id){const activity=definition(id);if(!activity)return null;if(classroom(activity))return groupClasses.getLifecycle(id);if(activity.runtime==='rig')return rig.getLifecycle?.(id);if(!lifecycles.has(id)&&activity.runtime==='facility')lifecycles.set(id,createFacilityLifecycle({station:machines.get(activity.stationId).station,architecture,metrics}));const machine=machines.get(activity.stationId);if(activity.runtime==='machine'){const owned=machine?.getLifecycle?.(id);if(owned)return owned;}if(!lifecycles.has(id))lifecycles.set(id,createMachineLifecycle({THREE,machine,metrics,activity,activityId:id}));return lifecycles.get(id);},
    sampleLifecycle(id,direction,u){const activity=definition(id);if(classroom(activity))return groupClasses.sampleLifecycle(id,direction,u);if(activity?.runtime==='rig')return rig.sampleLifecycle(id,direction,u);const machine=machines.get(activity?.stationId);if(activity?.runtime==='machine'&&machine?.getLifecycle?.(id)&&machine?.sampleLifecycle)return machine.sampleLifecycle(direction,u,id);return this.getLifecycle(id)?.sample(direction,u);},
    beginExit(id){const activity=definition(id);if(classroom(activity))groupClasses.beginExit(id);if(activity?.runtime==='facility'||activity?.runtime==='class')architecture.endFacility(activity.stationId);},
    beginReturn(id,phase){return classroom(definition(id))?groupClasses.beginReturn(id,phase):null;},
    sampleReturn(id,u){return classroom(definition(id))?groupClasses.sampleReturn(id,u):null;},
    getCapturedTransitionCoverage(id){const activity=definition(id);if(activity?.runtime==='rig')return rig.getCapturedTransitionCoverage?.(id)||null;if(activity?.runtime==='machine')return lifecycles.get(id)?.getCapturedTransitionCoverage?.()||{kind:'authored-transition',activityId:id,initialized:false,segments:[]};return{kind:'authored-transition',activityId:id,segments:[]};},
    getPoseContacts(id){return classroom(definition(id))?groupClasses.getPoseContacts(id):null;},
    getSetup:setup,
    getInventoryRoots(){return rig.getInventoryRoots?.()||[];},
    isReady(id){if(!classroom(definition(id)))return true;const info=groupClasses.getDiagnostics();return info.npcs.every(actor=>actor.status==='using'&&actor.kind===info.selectedKind);},
    getNavigationObstacles:()=>[...navigationObstacles,...(groupClasses?.getNavigationObstacles()||[])],
    getSegment:(id,phase)=>classroom(definition(id))?groupClasses.getSegment(id,phase):null,
    getLifecycleState:id=>definition(id)?.runtime==='rig'?rig.getLifecycleState?.(id):null,
    getVisualRoots(id){const activity=definition(id);if(classroom(activity))return groupClasses.getVisualRoots(id);if(activity?.runtime==='rig')return[rig.getVisualRoot(id)];const machine=machines.get(activity?.stationId);return machine?[machine.getVisualGroup?.()||machine.group]:[];},
    sample(id,phase,cycle){const activity=definition(id);if(!activity)return null;if(classroom(activity))return groupClasses.sample(id,phase,cycle);if(activity.runtime==='machine')return machines.get(activity.stationId)?.sampleActivity(phase,cycle,id);if(activity.runtime==='facility')return architecture.sampleFacility(activity.stationId,phase,metrics);return rig.sample(id,phase,cycle);},
    getCollisionVolumes(id){const activity=definition(id);if(classroom(activity))return groupClasses.getCollisionVolumes(id);if(activity?.runtime==='machine')return machines.get(activity.stationId)?.getCollisionVolumes()||[];if(activity?.runtime==='facility')return architecture.getCollisionVolumes?.(activity.stationId)||[];return rig.getCollisionVolumes(id);},
    getActualContacts(id){const activity=definition(id);if(classroom(activity))return groupClasses.getActualContacts(id);if(activity?.runtime==='machine')return machines.get(activity.stationId)?.getActualContacts();if(activity?.runtime==='facility')return architecture.getActualContacts?.(activity.stationId)||null;return rig.getActualContacts(id);},
  };
}
