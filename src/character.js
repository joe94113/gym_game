import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Smooth, proportioned athlete with fixed-length two-bone IK.
 * Coordinates are metres, face +Z. Hands are grip centres and feet are the
 * underside of the forefoot, so mechanisms and anatomy share real contacts.
 */
export function createCharacter({ THREE, scene, geometries = new Set(), extraMaterials = new Set(), textures = new Set() }) {
  const group = new THREE.Group();
  group.name = 'athlete';
  scene?.add(group);
  const UP = new THREE.Vector3(0, 1, 0);
  const FORWARD = new THREE.Vector3(0, 0, 1);
  const clamp = THREE.MathUtils.clamp;
  const primaryColor = '#dc6855';
  const secondaryColor = '#e2a261';

  const material = (settings) => {
    const m = new THREE.MeshStandardMaterial(settings);
    extraMaterials.add(m);
    return m;
  };
  const skin = material({ color: '#be9479', roughness: 0.67, metalness: 0 });
  const skinShade = material({ color: '#a97c63', roughness: 0.76 });
  const shirt = material({ color: '#98a58b', roughness: 0.93 });
  const trim = material({ color: '#4d5d4a', roughness: 0.88 });
  const pants = material({ color: '#303a36', roughness: 0.94 });
  const shorts = material({ color: '#1e2b26', roughness: 0.91 });
  const hairMat = material({ color: '#282622', roughness: 0.88 });
  const eyeWhite = material({ color: '#ebe5d9', roughness: 0.54 });
  const iris = material({ color: '#39392c', roughness: 0.43 });
  const shoeWhite = material({ color: '#e6e5d9', roughness: 0.84 });
  const sole = material({ color: '#a5afa1', roughness: 0.94 });
  const metal = material({ color: '#aeb8b0', roughness: 0.29, metalness: 0.78 });
  const weight = material({ color: '#242b27', roughness: 0.61, metalness: 0.3 });
  const primary = material({ color: primaryColor, roughness: 0.84, emissive: primaryColor, emissiveIntensity: 0.045, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const secondary = material({ color: secondaryColor, roughness: 0.84, emissive: secondaryColor, emissiveIntensity: 0.04, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  // An original, tiny knitted weave supplies close-up fabric detail, not an
  // image downloaded from another product. It is shared by all clothing.
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f1f1eb'; ctx.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 2) for (let x = 0; x < 64; x += 2) {
        ctx.fillStyle = (x + y) % 4 ? '#e4e6df' : '#f9f9f3';
        ctx.fillRect(x, y, 1, 1);
      }
      const fabric = new THREE.CanvasTexture(c);
      fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
      fabric.repeat.set(3, 4); fabric.colorSpace = THREE.SRGBColorSpace;
      textures.add(fabric); shirt.map = fabric; pants.map = fabric; shorts.map = fabric;
    }
  }
  const ownGeometry = g => { geometries.add(g); return g; };
  const sphereGeometry = ownGeometry(new THREE.SphereGeometry(1, 20, 14));
  const mesh = (geometry, mat, parent, x = 0, y = 0, z = 0) => {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z); object.castShadow = object.receiveShadow = true;
    parent.add(object); return object;
  };
  const ellipsoid = (parent, mat, x, y, z, sx, sy, sz) => {
    const object = mesh(sphereGeometry, mat, parent, x, y, z);
    object.scale.set(sx, sy, sz); return object;
  };
  const capsule = (parent, mat, x, y, z, radius, length) => {
    const g = ownGeometry(new THREE.CapsuleGeometry(radius, Math.max(0.001, length - 2 * radius), 4, 10));
    return mesh(g, mat, parent, x, y, z);
  };
  function mergeStaticMeshes(parent) {
    parent.updateMatrixWorld(true);
    const inverse = parent.matrixWorld.clone().invert(), byMaterial = new Map();
    parent.traverse(object => {
      if (!object.isMesh) return;
      if (!byMaterial.has(object.material)) byMaterial.set(object.material, []);
      byMaterial.get(object.material).push(object);
    });
    for (const [mat, objects] of byMaterial) {
      if (objects.length < 2) continue;
      const pieces = objects.map(object => object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
      const geometry = mergeGeometries(pieces, false);
      pieces.forEach(piece => piece.dispose());
      if (!geometry) continue;
      ownGeometry(geometry); objects.forEach(object => object.removeFromParent()); mesh(geometry, mat, parent);
    }
  }
  function gridGeometry(sample, uCount = 20, vCount = 14) {
    const positions = [], uv = [], indices = [];
    for (let j = 0; j <= vCount; j++) for (let i = 0; i <= uCount; i++) {
      positions.push(...sample(i / uCount, j / vCount)); uv.push(i / uCount, j / vCount);
    }
    for (let j = 0; j < vCount; j++) for (let i = 0; i < uCount; i++) {
      const a = j * (uCount + 1) + i, b = a + uCount + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return ownGeometry(geometry);
  }
  function profileAt(rings, y) {
    if (y <= rings[0][0]) return rings[0];
    for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) {
      const a = rings[i - 1], b = rings[i], t = (y - a[0]) / (b[0] - a[0]);
      return [y, THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t), THREE.MathUtils.lerp(a[3] || 0, b[3] || 0, t)];
    }
    return rings.at(-1);
  }
  function closeRings(geometry,segments,levels,centres) {
    const positions=Array.from(geometry.attributes.position.array),uv=Array.from(geometry.attributes.uv.array),indices=Array.from(geometry.index.array);
    for(let end=0;end<2;end++){
      const center=positions.length/3;positions.push(...centres[end]);uv.push(.5,.5);
      const row=end?levels*(segments+1):0;
      for(let i=0;i<=segments;i++){const p=(row+i)*3;positions.push(positions[p],positions[p+1],positions[p+2]);uv.push(.5+.5*Math.sin(i/segments*Math.PI*2),.5+.5*Math.cos(i/segments*Math.PI*2));}
      for(let i=0;i<segments;i++){const a=center+1+i,b=a+1;indices.push(...(end?[center,a,b]:[center,b,a]));}
    }
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
  function profileGeometry(rings, segments = 24, levels = 20, flatten = 1) {
    const y0 = rings[0][0], y1 = rings.at(-1)[0];
    const geometry=gridGeometry((u, v) => {
      const y = THREE.MathUtils.lerp(y0, y1, v), p = profileAt(rings, y), theta = u * Math.PI * 2;
      const c = Math.cos(theta);
      return [Math.sin(theta) * p[1], y, Math.sign(c) * Math.pow(Math.abs(c), flatten) * p[2] + (p[3] || 0)];
    }, segments, levels);
    return closeRings(geometry,segments,levels,[[0,y0,rings[0][3]||0],[0,y1,rings.at(-1)[3]||0]]);
  }
  const torsoProfile = [
    [0, .153, .095], [.065, .151, .100], [.145, .146, .099],
    [.23, .171, .111], [.32, .204, .124], [.395, .216, .128],
    [.46, .204, .111], [.495, .164, .086], [.505, .105, .066],
  ];
  const pelvisProfile = [[-.145, .117, .082], [-.105, .163, .112], [-.025, .17, .117], [.045, .153, .099], [.07, .145, .089]];
  const torsoRoot = new THREE.Group(); group.add(torsoRoot);
  const pelvisRoot = new THREE.Group(); group.add(pelvisRoot);
  mesh(profileGeometry(torsoProfile, 28, 28), shirt, torsoRoot);
  mesh(profileGeometry(pelvisProfile, 26, 16), shorts, pelvisRoot);
  // Neckline and side seams make the model read as fitted sportswear.
  const neckLine = mesh(ownGeometry(new THREE.TorusGeometry(.071, .007, 5, 24)), trim, torsoRoot, 0, .498, 0);
  neckLine.rotation.x = Math.PI / 2; neckLine.scale.z = .77;
  const waistband = mesh(profileGeometry([[.028, .158, .106], [.065, .154, .104]], 26, 2), trim, pelvisRoot);
  const logo = mesh(ownGeometry(new THREE.PlaneGeometry(.038, .014)), shoeWhite, torsoRoot, -.105, .411, .116);
  logo.rotation.y = -.2;

  const neck = mesh(ownGeometry(new THREE.CylinderGeometry(.046, .054, 1, 16)), skin, group);
  const headRoot = new THREE.Group(); group.add(headRoot);
  const headProfile = [[-.116, .031, .031, .015], [-.102, .052, .052, .015], [-.072, .072, .069, .01], [-.025, .085, .079, .003], [.035, .088, .082], [.078, .078, .07], [.108, .05, .045], [.12, .012, .012]];
  mesh(profileGeometry(headProfile, 28, 26, .68), skin, headRoot);
  const hair = mesh(gridGeometry((u, v) => {
    const theta = u * Math.PI * 2;
    const front = Math.cos(theta) > 0;
    const base = front ? .061 + .01 * Math.sin(theta * 2) : -.045;
    const phi = v * Math.PI / 2;
    return [Math.sin(theta) * .089 * Math.cos(phi), base + (.128 - base) * Math.sin(phi), Math.cos(theta) * .083 * Math.cos(phi) - .004];
  }, 28, 12), hairMat, headRoot);
  for (const s of [-1, 1]) {
    ellipsoid(headRoot, skin, s * .09, -.006, -.003, .015, .027, .013);
    ellipsoid(headRoot, skinShade, s * .100, -.006, .002, .004, .014, .006);
    ellipsoid(headRoot, eyeWhite, s * .035, .026, .078, .017, .0068, .005);
    ellipsoid(headRoot, iris, s * .035, .026, .0824, .0054, .0055, .0016);
    const brow = capsule(headRoot, hairMat, s * .035, .043, .081, .0028, .034);
    brow.rotation.z = Math.PI / 2 + s * .08;
  }
  ellipsoid(headRoot, skin, 0, -.004, .087, .010, .021, .019);
  ellipsoid(headRoot, skin, 0, -.016, .102, .013, .008, .009);
  const lips = ellipsoid(headRoot, skinShade, 0, -.053, .080, .021, .0035, .0025);
  ellipsoid(headRoot, skin, 0, -.085, .074, .029, .016, .005);
  mergeStaticMeshes(headRoot);

  const patches = [];
  let highlightedPrimary = [], highlightedSecondary = [];
  function registerPatch(object, key) {
    object.visible = false; object.castShadow = false; object.userData.muscle = key;
    patches.push(object); return object;
  }
  function profilePatch(parent, key, rings, sample, uCount = 12, vCount = 10) {
    return registerPatch(mesh(gridGeometry((u, v) => {
      const [theta, y] = sample(u, v), p = profileAt(rings, y);
      return [Math.sin(theta) * (p[1] + .0024), y, Math.cos(theta) * (p[2] + .0024) + (p[3] || 0)];
    }, uCount, vCount), primary, parent), key);
  }
  for (const s of [-1, 1]) {
    profilePatch(torsoRoot, 'chest', torsoProfile, (u,v) => {
      const theta = s * (.045 + u * 1.14);
      const lower = .265 + .038 * u - .015 * Math.sin(u * Math.PI);
      const upper = .448 - .026 * u;
      return [theta, THREE.MathUtils.lerp(lower, upper, v)];
    });
    profilePatch(torsoRoot, 'back', torsoProfile, (u,v) => [Math.PI + s * (.08 + u * (.65 + .5*v)), .15 + .275*v]);
    profilePatch(torsoRoot, 'back', torsoProfile, (u,v) => [Math.PI + s * (.04 + u*.45), .425 + .055*v]);
    profilePatch(pelvisRoot, 'glutes', pelvisProfile, (u,v) => [Math.PI + s * (.05 + u*1.0), -.115 + .145*v]);
    for (let row = 0; row < 3; row++) profilePatch(torsoRoot, 'core', torsoProfile, (u,v) => [s*(.035+u*.34), .065+row*.059+v*.049], 6, 5);
  }

  // Unit-length profiles share geometry; only their length scale follows the
  // fixed skeleton, never the requested contact distance.
  const armRings = [[-.18,.001,.001],[-.13,.041,.039],[-.04,.063,.057],[.10,.073,.064],[.35,.067,.059],[.60,.056,.051],[.84,.046,.043],[1,.042,.040]];
  const forearmRings = [[0,.043,.041],[.16,.052,.045],[.36,.054,.043],[.65,.045,.035],[.88,.032,.027],[1,.027,.024]];
  const thighRings = [[0,.079,.086],[.14,.096,.098],[.34,.098,.095],[.61,.082,.078],[.84,.061,.059],[1,.053,.051]];
  const calfRings = [[0,.051,.049],[.18,.056,.053],[.38,.065,.060],[.58,.053,.045],[.80,.034,.030],[1,.027,.026]];
  const armGeometry = profileGeometry(armRings, 20, 18);
  const forearmGeometry = profileGeometry(forearmRings, 18, 16);
  const thighGeometry = profileGeometry(thighRings, 22, 20);
  const calfGeometry = profileGeometry(calfRings, 20, 18);
  const legShortGeometry = profileGeometry([[0,.080,.087],[.14,.097,.099],[.34,.099,.096],[.48,.091,.0875]], 22, 9);
  function limbSurface(parent, key, rings, y0,y1, angle, spread, taper=.10) {
    return profilePatch(parent,key,rings,(u,v)=>{
      const inset=taper*Math.sin(v*Math.PI),theta=angle+(u-.5)*(spread-inset);
      return [theta,THREE.MathUtils.lerp(y0,y1,v)];
    },12,12);
  }

  function makeHand(s) {
    const hand = new THREE.Group(); group.add(hand);
    ellipsoid(hand, skin, 0, .009, -.028, .037, .018, .045);
    ellipsoid(hand, skin, -s*.027, .006, -.032, .015, .019, .029);
    const curled = new THREE.Group(), relaxed = new THREE.Group(); hand.add(curled,relaxed);
    for (let f=0;f<4;f++) {
      const x=(f-1.5)*.017, length=[.050,.058,.054,.043][f];
      const a=capsule(curled,skin,x,.010,.009,.008,length*.54);a.rotation.x=Math.PI/2;
      const b=capsule(curled,skin,x,-.012,.026,.0075,length*.38);b.rotation.x=.18;
      const c=capsule(curled,skin,x,-.028,.010,.007,length*.33);c.rotation.x=-Math.PI/2;
      const r=capsule(relaxed,skin,x,-.002,.012,.0078,length);r.rotation.x=Math.PI/2-.22;
    }
    const thumb1=capsule(curled,skin,s*.042,-.001,-.010,.010,.041);thumb1.rotation.z=-s*.57;thumb1.rotation.x=.58;
    const thumb2=capsule(curled,skin,s*.031,-.027,-.008,.009,.033);thumb2.rotation.z=s*.78;
    const thumbRelaxed=capsule(relaxed,skin,s*.039,.002,-.016,.010,.05);thumbRelaxed.rotation.z=-s*.60;thumbRelaxed.rotation.x=.35;
    mergeStaticMeshes(curled); mergeStaticMeshes(relaxed);
    const db=new THREE.Group();hand.add(db);
    const dbHandle=mesh(ownGeometry(new THREE.CylinderGeometry(.015,.015,.22,14)),metal,db);dbHandle.rotation.z=Math.PI/2;
    const headGeometry=ownGeometry(new THREE.CylinderGeometry(.095,.095,.075,12));
    for(const sign of [-1,1]){const end=mesh(headGeometry,weight,db,sign*.133,0,0);end.rotation.z=Math.PI/2;}
    db.visible=false;
    return {group:hand,curled,relaxed,db};
  }
  function shoeGeometry(midsole=false) {
    const rings=[[-.20,0,0],[-.185,.030,.034],[-.16,.045,.051],[-.12,.049,.055],[-.055,.051,.045],[.025,.060,.034],[.078,.047,.025],[.10,.026,.014],[.12,0,0]];
    const geometry=gridGeometry((u,v)=>{
      const z=THREE.MathUtils.lerp(-.20,.12,v),p=profileAt(rings,z),a=u*Math.PI*2;
      const toe=z>.06?Math.sqrt(Math.max(0,1-((z-.06)/.06)**2)):null;
      const width=toe===null?p[1]:.055*toe,height=toe===null?p[2]:.030*toe;
      const h=midsole?.012*Math.min(1,width/.020):height, cy=midsole?.012:height+.023;
      return [-Math.sin(a)*(width+(midsole?.003*Math.min(1,width/.020):0)),cy+Math.cos(a)*h,z];
    },24,28);
    return closeRings(geometry,24,28,[[0,midsole?.012:rings[0][2]+.023,-.20],[0,midsole?.012:rings.at(-1)[2]+.023,.12]]);
  }
  const shoeUpperGeometry=shoeGeometry(),shoeSoleGeometry=shoeGeometry(true);
  function makeShoe() {
    const root=new THREE.Group();group.add(root);
    mesh(shoeSoleGeometry,sole,root);mesh(shoeUpperGeometry,shoeWhite,root);
    ellipsoid(root,trim,0,.074,-.157,.047,.047,.020);
    for(let lace=0;lace<4;lace++){
      const l=capsule(root,shoeWhite,0,.111-lace*.006,-.102+lace*.021,.0025,.060);l.rotation.z=Math.PI/2;
    }
    for(const s of [-1,1]){const stripe=mesh(ownGeometry(new THREE.BoxGeometry(.003,.016,.09)),trim,root,s*.052,.058,-.005);stripe.rotation.x=-.22;}
    mergeStaticMeshes(root);
    return root;
  }
  const limbs=[-1,1].map(s=>{
    const upperArm=new THREE.Group(),forearm=new THREE.Group(),upperLeg=new THREE.Group(),lowerLeg=new THREE.Group();
    group.add(upperArm,forearm,upperLeg,lowerLeg);
    mesh(armGeometry,skin,upperArm);mesh(forearmGeometry,skin,forearm);
    mesh(thighGeometry,pants,upperLeg);mesh(legShortGeometry,shorts,upperLeg);mesh(calfGeometry,pants,lowerLeg);
    const elbow=ellipsoid(group,skin,0,0,0,.043,.043,.041);
    const knee=ellipsoid(group,pants,0,0,0,.053,.053,.051);
    const deltoid=limbSurface(upperArm,'shoulders',armRings,-.18,.27,0,Math.PI*2,0);
    closeRings(deltoid.geometry,12,12,[[0,-.18,0],[0,.27,0]]);
    limbSurface(upperArm,'biceps',armRings,.28,.87,0,2.12);
    limbSurface(upperArm,'triceps',armRings,.27,.89,Math.PI,2.00);
    limbSurface(forearm,'forearms',forearmRings,.12,.84,0,2.00);
    limbSurface(upperLeg,'quads',thighRings,.08,.86,0,2.25);
    limbSurface(upperLeg,'hamstrings',thighRings,.12,.84,Math.PI,2.1);
    limbSurface(lowerLeg,'calves',calfRings,.15,.76,Math.PI,2.35);
    return {s,upperArm,forearm,upperLeg,lowerLeg,elbow,knee,hand:makeHand(s),shoe:makeShoe()};
  });

  const vHip=new THREE.Vector3(),vShoulder=new THREE.Vector3(),vHead=new THREE.Vector3();
  const bodyAxis=new THREE.Vector3(),bodyForward=new THREE.Vector3(),bodyQuat=new THREE.Quaternion();
  const basis=new THREE.Matrix4();
  const tangent=new THREE.Vector3(),side=new THREE.Vector3(),normal=new THREE.Vector3();
  const vectors=()=>({root:new THREE.Vector3(),target:new THREE.Vector3(),joint:new THREE.Vector3(),end:new THREE.Vector3(),wrist:new THREE.Vector3(),ankle:new THREE.Vector3(),direction:new THREE.Vector3(),hint:new THREE.Vector3(),delta:new THREE.Vector3(),projected:new THREE.Vector3(),footForward:new THREE.Vector3(),footNormal:new THREE.Vector3(),footSide:new THREE.Vector3(),handAxis:new THREE.Vector3(),handSide:new THREE.Vector3(),handNormal:new THREE.Vector3()});
  const scratch=limbs.map(vectors);
  let maxReachError=0;
  const contacts={hands:[[0,0,0],[0,0,0]],feet:[[0,0,0],[0,0,0]],shoulders:[[0,0,0],[0,0,0]],elbows:[[0,0,0],[0,0,0]],wrists:[[0,0,0],[0,0,0]],hips:[[0,0,0],[0,0,0]],knees:[[0,0,0],[0,0,0]],ankles:[[0,0,0],[0,0,0]]};
  const read=(out,value,fallback)=>out.fromArray(value||fallback);
  const store=(array,v)=>{array[0]=v.x;array[1]=v.y;array[2]=v.z;};
  function solveIK(root,target,upper,lower,hint,joint,end,tmp) {
    tmp.delta.copy(target).sub(root);
    const original=tmp.delta.length(),d=clamp(original,Math.abs(upper-lower)+.00001,upper+lower-.00001);
    if(original<1e-8)tmp.delta.set(0,-1,0);else tmp.delta.multiplyScalar(1/original);
    end.copy(root).addScaledVector(tmp.delta,d);
    maxReachError=Math.max(maxReachError,end.distanceTo(target));
    tmp.projected.copy(hint).addScaledVector(tmp.delta,-hint.dot(tmp.delta));
    if(tmp.projected.lengthSq()<.00001){tmp.projected.set(0,0,1).addScaledVector(tmp.delta,-tmp.delta.z);if(tmp.projected.lengthSq()<.00001)tmp.projected.set(0,1,0).addScaledVector(tmp.delta,-tmp.delta.y);}
    tmp.projected.normalize();
    const a=(upper*upper-lower*lower+d*d)/(2*d),h=Math.sqrt(Math.max(0,upper*upper-a*a));
    joint.copy(root).addScaledVector(tmp.delta,a).addScaledVector(tmp.projected,h);
  }
  function orientSegment(object,a,b,referenceForward=FORWARD) {
    tangent.copy(b).sub(a).normalize();
    normal.copy(referenceForward).addScaledVector(tangent,-referenceForward.dot(tangent));
    if(normal.lengthSq()<.00001)normal.copy(UP).addScaledVector(tangent,-tangent.y);
    normal.normalize();side.crossVectors(tangent,normal).normalize();
    basis.makeBasis(side,tangent,normal);object.quaternion.setFromRotationMatrix(basis);object.position.copy(a);
    // Geometry's Y spans 0..1. Physical segment length is fixed by IK.
    object.scale.y=a.distanceTo(b);
  }

  function pose(p={}) {
    maxReachError=0;
    read(vHip,p.hip,[0,1,0]);read(vShoulder,p.shoulder,[0,1.48,0]);read(vHead,p.head,[0,1.70,0]);
    bodyAxis.copy(vShoulder).sub(vHip);const torsoLength=bodyAxis.length();bodyAxis.normalize();
    bodyQuat.setFromUnitVectors(UP,bodyAxis);
    bodyForward.copy(FORWARD).applyQuaternion(bodyQuat);
    torsoRoot.position.copy(vHip);torsoRoot.quaternion.copy(bodyQuat);torsoRoot.scale.y=torsoLength/.48;
    pelvisRoot.position.copy(vHip);pelvisRoot.quaternion.copy(bodyQuat);
    headRoot.position.copy(vHead);headRoot.quaternion.copy(p.lying?bodyQuat:new THREE.Quaternion());
    // A separate neck bridges the clavicle and head rather than stretching
    // the face when a torso leans into a supported row or cycle position.
    const neckStart=scratch[0].root.copy(vShoulder).addScaledVector(bodyAxis,.025);
    const neckEnd=scratch[0].target.copy(vHead).add(p.lying?new THREE.Vector3(0,0,.085):new THREE.Vector3(0,-.086,0));
    neck.position.copy(neckStart).add(neckEnd).multiplyScalar(.5);
    neck.scale.y=Math.max(.04,neckStart.distanceTo(neckEnd));
    neck.quaternion.setFromUnitVectors(UP,neckEnd.clone().sub(neckStart).normalize());
    const gripping=p.gripping??!!p.hands;
    limbs.forEach((limb,i)=>{
      const t=scratch[i],s=limb.s;
      t.root.set(s*.23,-.025,0).applyQuaternion(bodyQuat).add(vShoulder);
      store(contacts.shoulders[i],t.root);
      read(t.target,p.hands?.[i],[s*.265,.87,.025]);
      if(p.elbows?.[i])t.hint.fromArray(p.elbows[i]).sub(t.root);else read(t.hint,p.elbowHints?.[i],gripping?[s*.6,-.75,.15]:[s*.1,-.2,-1]);
      solveIK(t.root,t.target,.29,.33,t.hint,t.joint,t.end,t);
      t.wrist.copy(t.end).sub(t.joint).multiplyScalar(.27/.33).add(t.joint);
      orientSegment(limb.upperArm,t.root,t.joint,bodyForward);
      orientSegment(limb.forearm,t.joint,t.wrist,bodyForward);
      limb.elbow.position.copy(t.joint);
      t.handAxis.copy(t.end).sub(t.joint).normalize();
      read(t.handSide,p.handDirections?.[i],[s,0,0]);
      t.handSide.addScaledVector(t.handAxis,-t.handSide.dot(t.handAxis));
      if(t.handSide.lengthSq()<.00001)t.handSide.set(1,0,0).addScaledVector(t.handAxis,-t.handAxis.x);
      if(t.handSide.lengthSq()<.00001)t.handSide.set(0,1,0).addScaledVector(t.handAxis,-t.handAxis.y);
      t.handSide.normalize();t.handNormal.crossVectors(t.handAxis,t.handSide).normalize();
      basis.makeBasis(t.handSide,t.handNormal,t.handAxis);
      limb.hand.group.quaternion.setFromRotationMatrix(basis);limb.hand.group.position.copy(t.end);
      limb.hand.curled.visible=gripping;limb.hand.relaxed.visible=!gripping;limb.hand.db.visible=!!p.dumbbells;
      store(contacts.hands[i],t.end);store(contacts.elbows[i],t.joint);store(contacts.wrists[i],t.wrist);

      t.root.set(s*.105,-.055,0).applyQuaternion(bodyQuat).add(vHip);store(contacts.hips[i],t.root);
      read(t.target,p.feet?.[i],[s*.12,0,.10]);
      read(t.footForward,p.footDirections?.[i],[0,0,1]);read(t.footNormal,p.footNormals?.[i],[0,1,0]);
      t.footNormal.normalize();t.footForward.addScaledVector(t.footNormal,-t.footForward.dot(t.footNormal));
      if(t.footForward.lengthSq()<.00001)t.footForward.set(0,0,1).addScaledVector(t.footNormal,-t.footNormal.z);
      if(t.footForward.lengthSq()<.00001)t.footForward.set(0,1,0).addScaledVector(t.footNormal,-t.footNormal.y);
      t.footForward.normalize();t.footSide.crossVectors(t.footNormal,t.footForward).normalize();t.footNormal.crossVectors(t.footForward,t.footSide).normalize();
      t.ankle.copy(t.target).addScaledVector(t.footForward,-.10).addScaledVector(t.footNormal,.09);
      if(p.knees?.[i])t.hint.fromArray(p.knees[i]).sub(t.root);else read(t.hint,p.kneeHints?.[i],p.lying?[0,1,0]:[0,0,1]);
      solveIK(t.root,t.ankle,.43,.43,t.hint,t.joint,t.end,t);
      orientSegment(limb.upperLeg,t.root,t.joint,bodyForward);
      orientSegment(limb.lowerLeg,t.joint,t.end,bodyForward);
      limb.knee.position.copy(t.joint);
      basis.makeBasis(t.footSide,t.footNormal,t.footForward);limb.shoe.quaternion.setFromRotationMatrix(basis);
      limb.shoe.position.copy(t.end).addScaledVector(t.footForward,.10).addScaledVector(t.footNormal,-.09);
      store(contacts.feet[i],limb.shoe.position);store(contacts.knees[i],t.joint);store(contacts.ankles[i],t.end);
    });
  }
  function setMuscleHighlights(primaryKeys=[],secondaryKeys=[]) {
    const supported=new Set(patches.map(p=>p.userData.muscle));
    highlightedPrimary=[...new Set(primaryKeys)].filter(key=>supported.has(key));
    highlightedSecondary=[...new Set(secondaryKeys)].filter(key=>supported.has(key)&&!highlightedPrimary.includes(key));
    for(const patch of patches){const main=highlightedPrimary.includes(patch.userData.muscle);patch.visible=main||highlightedSecondary.includes(patch.userData.muscle);patch.material=main?primary:secondary;}
  }
  pose();
  return {
    group,pose,setMuscleHighlights,
    getMuscleHighlights(){return{primary:[...highlightedPrimary],secondary:[...highlightedSecondary]};},
    getContactPoints(){return Object.fromEntries([...Object.entries(contacts).map(([key,value])=>[key,value.map(point=>[...point])]),['maxReachError',maxReachError]]);},
  };
}
