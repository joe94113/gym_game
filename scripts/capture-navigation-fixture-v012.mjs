import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeArchitecture,THREE} from './room-test-helpers.mjs';
import {createEquipmentSystem} from '../src/equipment.js';
import {createAdditionalEquipment,applyAdditionalVariants,ADDITIONAL_EQUIPMENT_TYPES} from '../src/additional-equipment.js';
import {stations} from '../src/data.js';
import {GYM_LAYOUT} from '../src/gym-layout.js';

const snapshot='.local-tools/v012-before/src/world-controller.js',source=readFileSync(snapshot,'utf8'),hash=value=>createHash('sha256').update(value).digest('hex');
const blocked=source.slice(source.indexOf('  function blocked('),source.indexOf('  function getZone(')),path=source.slice(source.indexOf('  function findPath('),source.indexOf('  const crowd=createGymCrowd('));
if(!blocked.includes('exerciseRig.getNavigationObstacles')||!path.includes('opened.sort'))throw Error('Unexpected sealed navigation implementation.');
mkdirSync('tests/fixtures',{recursive:true});
const oracle=`// Verbatim navigation functions from the sealed v0.11 controller.\n// SHA-256 of original complete controller: ${hash(source)}\nexport function createLegacyNavigationV012({THREE,bounds,colliders,getDynamicObstacles=()=>[]}){\n const clamp=THREE.MathUtils.clamp,exerciseRig={getNavigationObstacles:getDynamicObstacles};\n${blocked}${path}\n return{blocked,findPath};\n}\n`;
writeFileSync('tests/fixtures/navigation-oracle-v012.mjs',oracle);
const h=makeArchitecture(),metrics=JSON.parse(readFileSync('artifacts/room-gpu-resources-v011/native-cycle.json','utf8')).report.model.metrics;
const label=(parent,text,x=0,y=0,z=0)=>{const group=new THREE.Group();group.position.set(x,y,z);parent.add(group);return group;},collider=(x,z,w,d,padding=0)=>{const record={x,z,hx:w/2+padding,hz:d/2+padding};h.colliders.push(record);return record;};
const options={THREE,scene:h.scene,stations,materials:h.materials,geometries:h.geometries,extraMaterials:h.extraMaterials,textures:h.textures,label,collider,characterMetrics:metrics};
const machines=createEquipmentSystem({...options,stations:stations.filter(s=>!['stretchZone','facility'].includes(s.type)&&!ADDITIONAL_EQUIPMENT_TYPES.has(s.type))}).machines;
for(const [id,machine]of createAdditionalEquipment({...options,baseMachines:machines}).machines)machines.set(id,machine);applyAdditionalVariants(machines,options);
for(const [id,facility]of h.architecture.facilities)machines.set(id,facility);
const stretch=stations.find(station=>station.id==='stretch-zone');machines.set(stretch.id,{station:stretch,interaction:new THREE.Vector3(stretch.position.x,0,stretch.position.z+2.2)});
const doors=[];for(const door of h.architecture.getDiagnostics().doors){const before=h.colliders.map(c=>!!c.disabled);h.architecture.beginFacility(door.id);const index=h.colliders.findIndex((c,i)=>!!c.disabled&&!before[i]);if(index<0)throw Error(`Door blocker missing: ${door.id}`);doors.push({id:door.id,index});h.architecture.endFacility(door.id);}
const files=['src/gym-layout.js','src/data.js','src/equipment.js','src/additional-equipment.js','src/gym-architecture.js','src/reception-scenes.js'];
const fixture={scope:'CPU capture of actual production architecture and equipment constructors, including reverse-fly alternate collider, real door blockers, and all 56 installed interaction points. No renderer, GPU, model decoding, skeleton posing or full-motion qualification. Production measurements reused from accepted v0.11 native model report. Pinned navigation fixture is independent of browser timing and represents the preserved layout.',bounds:GYM_LAYOUT.bounds,spawn:GYM_LAYOUT.spawn,colliders:h.colliders,doors,endpoints:[...machines.values()].map(machine=>({id:machine.station.id,point:machine.interaction.toArray()})),captureSourceHashes:Object.fromEntries(files.map(file=>[file,hash(readFileSync(file))])),oracleControllerSha256:hash(source),oracleFileSha256:hash(oracle)};
writeFileSync('tests/fixtures/navigation-layout-v012.json',JSON.stringify(fixture,null,2));h.dispose();console.log(JSON.stringify({colliders:fixture.colliders.length,doors:doors.length,endpoints:fixture.endpoints.length,oracleSha:fixture.oracleControllerSha256}));
