"""Promote a visually reviewed clothing candidate atomically (run after QA)."""
from pathlib import Path
import json,struct,os,shutil,hashlib
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/athlete';ART=ROOT/'artifacts'
def checked(path):
 path=path.resolve()
 if ROOT not in path.parents:raise RuntimeError('Target outside workspace: '+str(path))
 return path
def gltf(path):
 data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0]
 return json.loads(data[20:20+size])
candidate=checked(ART/'athlete-dressed-candidate.glb');metadata=json.loads((ART/'athlete-dressed-rig.json').read_text())
old=gltf(OUT/'athlete.glb');new=gltf(candidate)
assert metadata['height']==1.78
assert 'Athlete_CompressionShorts_export' in metadata['meshNames']
assert len(metadata['bones'])==53
oldnodes={n.get('name'):n for n in old['nodes']};newnodes={n.get('name'):n for n in new['nodes']}
for bone in metadata['bones']:
 for field in ['translation','rotation','scale','matrix']:
  assert oldnodes[bone].get(field)==newnodes[bone].get(field),(bone,field)
for material in new.get('materials',[]):
 name=material.get('name','').lower();masked=any(x in name for x in ['eyebrow','eyelash','short01'])
 assert material.get('alphaMode')==('MASK' if masked else 'OPAQUE'),name
records=[]
for source,target in [(candidate,OUT/'athlete.glb'),(ART/'athlete-dressed-rig.json',OUT/'rig.json'),(ART/'athlete-dressed-credits.json',OUT/'credits.json'),(ART/'ASSET-LICENSES-dressed.md',ROOT/'ASSET-LICENSES.md')]:
 source=checked(source);target=checked(target);temporary=checked(ART/(target.name+'.promoting'))
 shutil.copyfile(str(source),str(temporary));os.replace(str(temporary),str(target))
 records.append({'file':str(target.relative_to(ROOT)),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
for path in OUT.iterdir():
 if path.is_file() and path.name not in ['athlete.glb','rig.json','credits.json']:
  source=checked(path);target=checked(ART/path.name)
  if target.exists():target=checked(ART/('old-'+path.name))
  os.replace(str(source),str(target))
(ART/'athlete-dressed-promoted.json').write_text(json.dumps({'files':records,'bonesUnchanged':True,'triangleCount':metadata['triangles'],'height':metadata['height']},indent=2))
print(json.dumps(records,indent=2))
