import {readFileSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';

// Hash the actually imported local modules, rather than an outdated manual
// list that can omit a new calibration/helper dependency. Three itself is
// pinned by the package/lock files; no third-party modules are traversed.
export function preparationSourceHashes(root='.'){
 const absolute=resolve(root),visited=new Set(),pending=['src/skinned-character.js','src/extended-rig.js','src/equipment.js','src/machine-lifecycle.js','src/data.js','src/additional-equipment.js'];
 while(pending.length){
  const name=pending.pop();if(visited.has(name))continue;visited.add(name);
  const source=readFileSync(resolve(absolute,name),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.[^'"]+)['"]/g)){
   const child=relative(absolute,resolve(absolute,dirname(name),match[1])).replaceAll('\\','/');
   if(child.startsWith('../'))throw new Error('preparation module escaped source root: '+child);
   pending.push(child);
  }
 }
 for(const name of ['public/models/athlete/athlete.glb','public/models/athlete/rig.json','package.json','package-lock.json'])visited.add(name);
 return Object.fromEntries([...visited].sort().map(name=>[name,createHash('sha256').update(readFileSync(resolve(absolute,name))).digest('hex')]));
}

export function preparationValidatorHashes(){
 return Object.fromEntries(['scripts/preparation-sources-v013.mjs','scripts/preparation-fixture-v013.mjs','scripts/audit-preparation-v013.mjs','src/collision-validation.js'].map(name=>[name,createHash('sha256').update(readFileSync(name)).digest('hex')]));
}
