import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSkinnedCharacter } from './skinned-character.js';
import { createEquipmentSystem } from './equipment.js';
import {createAdditionalEquipment,applyAdditionalVariants,ADDITIONAL_EQUIPMENT_TYPES} from './additional-equipment.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {createActivityRig} from './extended-rig.js';
import {createActivityRuntime} from './activity-runtime.js';
import {createGymArchitecture} from './gym-architecture.js';
import {floorHeightAt} from './gym-layout.js';
import {createWorldController} from './world-controller.js';
import {createGroupClassSystem} from './classes/group-class-system.js';
import {createEquipmentBatcher} from './equipment-batching.js';
import {optimizeFlatTransparentPlanes} from './flat-transparent-v015.js';
import {initialRendererConfiguration} from './device-profile-v016.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, t) => a + (b - a) * t;

export async function createWorld({ canvas, stations, onNearbyChange = () => {}, onZoneChange = () => {}, onPoseProgress = () => {}, onReady = () => {},onAssetProgress=()=>{},onTransition=()=>{},onActivityChange=()=>{} }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d6ded7');
  scene.fog = new THREE.Fog('#d6ded7', 42, 92);
  const initialRendering=initialRendererConfiguration(window);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: initialRendering.antialias, powerPreference: initialRendering.powerPreference });
  renderer.setPixelRatio(initialRendering.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = initialRendering.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentTarget = environmentGenerator.fromScene(roomEnvironment, 0.045);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.48;
  roomEnvironment.dispose();
  environmentGenerator.dispose();
  const camera = new THREE.PerspectiveCamera(51, window.innerWidth / window.innerHeight, 0.1, 150);
  const colliders = [];
  const materials = {
    rubber: new THREE.MeshStandardMaterial({ color: '#353c38', roughness: 0.94 }),
    rubberAlt: new THREE.MeshStandardMaterial({ color: '#3a413c', roughness: 0.98 }),
    graphite: new THREE.MeshStandardMaterial({ color: '#26312d', metalness: 0.5, roughness: 0.36 }),
    steel: new THREE.MeshStandardMaterial({ color: '#89958d', metalness: 0.8, roughness: 0.25 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#c7cfca', metalness: 0.85, roughness: 0.2 }),
    pad: new THREE.MeshStandardMaterial({ color: '#485e4e', roughness: 0.85 }),
    accent: new THREE.MeshStandardMaterial({ color: '#c5e998', roughness: 0.6 }),
    cream: new THREE.MeshStandardMaterial({ color: '#969e90', roughness: 0.94 }),
    wood: new THREE.MeshStandardMaterial({ color: '#b89b75', roughness: 0.78 }),
    black: new THREE.MeshStandardMaterial({ color: '#18201d', roughness: 0.65 }),
    white: new THREE.MeshStandardMaterial({ color: '#bdc3b5', roughness: 0.93 }),
    grass: new THREE.MeshStandardMaterial({ color: '#637b50', roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#b9d3c4', transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0.15, depthWrite: false }),
    light: new THREE.MeshBasicMaterial({ color: '#fff5d9' }),
  };
  const geometries = new Set();
  const extraMaterials = new Set();
  const textures = new Set();
  function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent, x, y, z, w, h, d, material) { return mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z); }
  function cylinder(parent, x, y, z, r, h, material, sides = 12) { return mesh(new THREE.CylinderGeometry(r, r, h, sides), material, parent, x, y, z); }
  function sphere(parent, x, y, z, r, material) { return mesh(new THREE.SphereGeometry(r, 14, 10), material, parent, x, y, z); }
  function rod(parent, a, b, radius = 0.055, material = materials.graphite) {
    const line = cylinder(parent, 0, 0, 0, radius, 1, material);
    setRod(line, a, b);
    return line;
  }
  function setRod(object, a, b) {
    const p = a.isVector3 ? a : new THREE.Vector3(...a);
    const q = b.isVector3 ? b : new THREE.Vector3(...b);
    const direction = q.clone().sub(p);
    object.position.copy(p).add(q).multiplyScalar(0.5);
    object.scale.y = direction.length();
    object.quaternion.setFromUnitVectors(UP, direction.normalize());
  }
  function collider(x, z, w, d, padding = 0) { const record={ x,z,hx:w/2+padding,hz:d/2+padding };colliders.push(record);return record; }
  function textPlane(text, { width = 3, height = 0.5, color = '#f1f0e7', background = null, font = 700, size = 54 } = {}) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = Math.max(128, Math.round(1024 * height / width));
    const ctx = c.getContext('2d');
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${font} ${size}px "Microsoft JhengHei", "Noto Sans TC", Arial, sans-serif`;
    ctx.fillText(text, 512, c.height / 2, 980);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    extraMaterials.add(mat);
    const label = mesh(new THREE.PlaneGeometry(width, height), mat, new THREE.Group());
    label.castShadow = false; label.receiveShadow = false;
    return label;
  }
  function label(parent, text, x, y, z, opts = {}, rotation = 0) {
    const item = textPlane(text, opts); parent.add(item); item.position.set(x, y, z); item.rotation.y = rotation; return item;
  }
  function floorLabel(text, x, z, width = 6) {
    const l = label(scene, text, x, 0.035, z, { width, height: 0.65, color: '#b5c4b3', size: 52 });
    l.rotation.x = -Math.PI / 2;
  }
  function weightPlate(parent, x, y, z, radius = 0.32) {
    const p = cylinder(parent, x, y, z, radius, 0.12, materials.black, 24); p.rotation.z = Math.PI / 2;
    const hub = cylinder(parent, x, y, z, 0.075, 0.14, materials.chrome); hub.rotation.z = Math.PI / 2;
    const stripe = cylinder(parent, x + 0.065, y, z, radius * 0.76, 0.008, materials.pad, 24); stripe.rotation.z = Math.PI / 2;
  }
  function barbell(parent, y = 1.4, z = 0) {
    const group = new THREE.Group(); parent.add(group); group.position.set(0, y, z);
    rod(group, [-1.35, 0, 0], [1.35, 0, 0], 0.033, materials.chrome);
    for (const sign of [-1, 1]) { weightPlate(group, sign * 1, 0, 0, 0.32); weightPlate(group, sign * 1.15, 0, 0, 0.27); }
    return group;
  }
  function dumbbell(parent, x, y, z, small = false) {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    const r = small ? 0.095 : 0.13;
    rod(g, [-0.16, 0, 0], [0.16, 0, 0], 0.025, materials.chrome);
    for (const s of [-1, 1]) { const p = cylinder(g, s * 0.16, 0, 0, r, 0.12, materials.black, 8); p.rotation.z = Math.PI / 2; }
    return g;
  }
  function plant(x, z, scale = 1) {
    const group = new THREE.Group(); scene.add(group); group.position.set(x, 0, z); group.scale.setScalar(scale);
    cylinder(group, 0, 0.27, 0, 0.3, 0.55, materials.cream);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4c6854', roughness: 0.9 }); extraMaterials.add(leafMat);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, h = 0.8 + (i % 3) * 0.27;
      rod(group, [0, 0.4, 0], [Math.cos(a) * 0.35, h, Math.sin(a) * 0.35], 0.018, leafMat);
      const leaf = sphere(group, Math.cos(a) * 0.38, h, Math.sin(a) * 0.38, 0.22, leafMat);
      leaf.scale.set(0.65, 2.1, 0.6); leaf.rotation.z = Math.cos(a) * 0.45;
    }
  }

  scene.add(new THREE.HemisphereLight('#ecf5e9', '#606d61', 2.7));
  const sun = new THREE.DirectionalLight('#fff1d8', 3.1);
  sun.position.set(-18, 32, -22); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 1, far: 95 });
  sun.shadow.normalBias = 0.055; sun.shadow.bias = -0.0002;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#e9f4ef', 1.1); fill.position.set(10, 8, 20); scene.add(fill);

  const architecture=createGymArchitecture({THREE,scene,materials,geometries,extraMaterials,textures,box,cylinder,sphere,rod,label,collider,plant,dumbbell});

  // Batch fixed architecture by material. Hundreds of floor tiles and props then
  // cost a handful of draw calls while all exercise mechanisms remain movable.
  scene.updateMatrixWorld(true);
  const staticByMaterial = new Map();
  scene.traverse(object => {
    if (!object.isMesh || object.userData.noStaticBatch || object.material.transparent || Array.isArray(object.material)) return;
    for(let parent=object.parent;parent;parent=parent.parent)if(parent.userData.noStaticBatch)return;
    let roomId='global';for(let parent=object;parent;parent=parent.parent)if(parent.userData.roomId){roomId=parent.userData.roomId;break;}
    const key=`${roomId}:${object.material.uuid}`;
    if (!staticByMaterial.has(key)) staticByMaterial.set(key, {material:object.material,roomId,objects:[]});
    staticByMaterial.get(key).objects.push(object);
  });
  for (const {material,roomId,objects} of staticByMaterial.values()) {
    if (objects.length < 2) continue;
    const pieces = objects.map(object => object.geometry.clone().applyMatrix4(object.matrixWorld));
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach(piece => piece.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, material);
    geometries.add(geometry); merged.receiveShadow = true; merged.castShadow = true;
    objects.forEach(object => object.removeFromParent());merged.userData.roomId=roomId;
    (architecture.roomZones?.getRoot(roomId)||scene).add(merged);
  }

  const character=await createSkinnedCharacter({THREE,scene,geometries,extraMaterials,textures,onProgress:onAssetProgress});
  const metrics=character.getAssetInfo().metrics;
  const equipment=createEquipmentSystem({THREE,scene,stations:stations.filter(s=>!['stretchZone','facility'].includes(s.type)&&!ADDITIONAL_EQUIPMENT_TYPES.has(s.type)),materials,geometries,extraMaterials,textures,label,collider,characterMetrics:metrics});
  const machineMap=equipment.machines;
  const additional=createAdditionalEquipment({scene,stations,materials,geometries,extraMaterials,textures,label,collider,characterMetrics:metrics,baseMachines:machineMap});
  for(const [id,machine]of additional.machines)machineMap.set(id,machine);
  for(const machine of machineMap.values())machine.group.position.y=floorHeightAt(machine.station.position.x,machine.station.position.z);
  applyAdditionalVariants(machineMap,{scene,materials,geometries,extraMaterials,textures,label,collider,characterMetrics:metrics});
  for(const [id,facility]of architecture.facilities)machineMap.set(id,facility);
  const stretchStation=stations.find(s=>s.id==='stretch-zone');
  if(stretchStation){
    const group=new THREE.Group();scene.add(group);group.position.set(stretchStation.position.x,floorHeightAt(stretchStation.position.x,stretchStation.position.z),stretchStation.position.z);
    box(group,0,.035,0,1.75,.06,2.8,materials.pad);
    label(group,'25',-.65,1.25,-.8,{width:.55,height:.3,color:'#e7f4d0',size:76});
    machineMap.set(stretchStation.id,{station:stretchStation,group,type:'stretchZone',interaction:new THREE.Vector3(stretchStation.position.x,0,stretchStation.position.z+2.2),footprint:{w:1.75,d:2.8},update:()=>null});
  }
  const rig=createActivityRig({THREE,scene,materials,geometries,extraMaterials,textures,machines:machineMap,characterMetrics:metrics});
  const groupClasses=createGroupClassSystem({THREE,scene,metrics,materials,geometries,extraMaterials,architecture,station:stations.find(s=>s.id==='group-class')});
  const exerciseRig=createActivityRuntime({rig,machines:machineMap,architecture,metrics,groupClasses});
  const batcher=createEquipmentBatcher({THREE,scene,machines:machineMap,cellSize:12,enabled:true});
  const flatTransparency=optimizeFlatTransparentPlanes({THREE,scene});
  return createWorldController({scene,renderer,camera,canvas,character,machineMap,exerciseRig,architecture,groupClasses,batcher,flatTransparency,colliders,geometries,extraMaterials,textures,materials,environmentTarget,mesh,onNearbyChange,onZoneChange,onPoseProgress,onReady,onTransition,onAssetProgress,onActivityChange});
}
