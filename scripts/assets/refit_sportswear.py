"""Replace loose shorts with body-fitted sportswear without changing any rig transforms."""
import bpy,bmesh,json,struct,copy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
TOOL=ROOT/'.local-tools';OUT=ROOT/'artifacts'
bpy.ops.wm.open_mainfile(filepath=str(TOOL/'athlete-final.blend'))
root=bpy.data.objects['FORM_Athlete'];rig=bpy.data.objects['FORM_Athlete_Rig_export']
oldbody=bpy.data.objects['FORM_Athlete_Body_export'];oldshorts=bpy.data.objects['Athlete_Shorts_export']
source=bpy.data.objects['FORM_Athlete_Body']
body=source.copy();body.data=source.data.copy();bpy.context.scene.collection.objects.link(body)
body.name='FORM_Athlete_Body_rebuilt';body.parent=rig;body.matrix_parent_inverse=oldbody.matrix_parent_inverse.copy();body.matrix_basis=oldbody.matrix_basis.copy()
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
if body.data.shape_keys:bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
for modifier in list(body.modifiers):
 if modifier.type=='ARMATURE':modifier.object=rig;modifier.use_deform_preserve_volume=False
 elif modifier.type=='MASK':
  if 'swim_shorts' in modifier.name:body.modifiers.remove(modifier)
  else:bpy.ops.object.modifier_apply(modifier=modifier.name)
 else:body.modifiers.remove(modifier)
body['asset_kind']='MakeHuman continuous weighted body'
# A separate shell follows the exact pelvis/thigh topology and deform weights.
shorts=body.copy();shorts.data=body.data.copy();bpy.context.scene.collection.objects.link(shorts);shorts.name='Athlete_CompressionShorts_export'
factor=root.scale.x;ground=root.location.z
lower=(.650-ground)/factor;upper=(1.025-ground)/factor
bm=bmesh.new();bm.from_mesh(shorts.data)
# In the A-pose, fingers share the same height band as the hips. Keep only
# the central pelvis and thighs, so no hand surface enters the garment.
bmesh.ops.delete(bm,geom=[v for v in bm.verts if abs(v.co.x)>.25],context='VERTS')
for height,normal in [(lower,(0,0,-1)),(upper,(0,0,1))]:
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,0,height),plane_no=normal,clear_outer=True,clear_inner=False)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
# Normal offset retains the underlying skin weights, including the hip crease.
for v in bm.verts:v.co+=v.normal*(.0055/factor)
bm.to_mesh(shorts.data);bm.free();shorts.data.update()
# Small extra subdivisions provide enough vertices through the hip bend; no
# smoothing/shrinking changes the fit or the authored human silhouette.
bpy.ops.object.select_all(action='DESELECT');shorts.select_set(True);bpy.context.view_layer.objects.active=shorts
sub=shorts.modifiers.new('Stretch fabric mesh density','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=1
bpy.ops.object.modifier_apply(modifier=sub.name)
material=bpy.data.materials.new('FORM charcoal compression fabric');material.use_nodes=True
bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.022,.032,.035,1);bsdf.inputs['Roughness'].default_value=.83
shorts.data.materials.clear();shorts.data.materials.append(material)
for poly in shorts.data.polygons:poly.use_smooth=True;poly.material_index=0
shorts['source']='Derivative of MakeHuman CC0 body surface';shorts['garment']='Fitted athletic compression shorts'
bpy.data.objects.remove(oldshorts,do_unlink=True);bpy.data.objects.remove(oldbody,do_unlink=True);body.name='FORM_Athlete_Body_export'
# The sourced tank hem had almost 50% thigh influence. Fabric above the hip
# crease should move with the pelvis rather than be pulled between the legs.
top=bpy.data.objects['Athlete_Top_export'];pelvis=top.vertex_groups['pelvis'];changed=0
leg_groups=[g for g in top.vertex_groups if g.name.startswith(('thigh','calf','foot','ball'))]
for vertex in top.data.vertices:
 moved=sum(w.weight for w in vertex.groups if any(w.group==g.index for g in leg_groups))
 if moved>0:
  existing=next((w.weight for w in vertex.groups if w.group==pelvis.index),0)
  pelvis.add([vertex.index],existing+moved,'REPLACE')
  for group in leg_groups:group.remove([vertex.index])
  changed+=1
print('TANK_HEM_WEIGHTS_REPAIRED',changed,flush=True)
# Keep only the export hierarchy visible/selected. Rig and root are untouched.
def belongs(obj):
 p=obj
 while p:
  if p==root:return True
  p=p.parent
 return False
objects=[obj for obj in bpy.context.scene.objects if belongs(obj)]
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':obj.hide_render=not belongs(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
filename=OUT/'athlete-dressed-candidate.glb'
bpy.ops.export_scene.gltf(filepath=str(filename),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_morph=False,export_animations=False,export_skins=True,export_extras=True,export_materials='EXPORT',export_image_format='AUTO')
bpy.ops.wm.save_as_mainfile(filepath=str(TOOL/'athlete-dressed-candidate.blend'))
# Explicit opaque/masked material modes preserve web depth sorting.
blob=filename.read_bytes();length,kind=struct.unpack_from('<II',blob,12);gltf=json.loads(blob[20:20+length])
for mat in gltf.get('materials',[]):
 name=mat.get('name','').lower()
 if any(term in name for term in ['eyebrow','eyelash','short01']):mat['alphaMode']='MASK';mat['alphaCutoff']=.4;mat['doubleSided']=True
 else:mat['alphaMode']='OPAQUE';mat.pop('alphaCutoff',None);mat['doubleSided']=False
payload=json.dumps(gltf,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4);binary=blob[20+length:]
blob=struct.pack('<III',0x46546c67,2,20+len(payload)+len(binary))+struct.pack('<II',len(payload),0x4e4f534a)+payload+binary;filename.write_bytes(blob)
metadata=json.loads((ROOT/'public/models/athlete/rig.json').read_text())
metadata['meshNames']=[obj.name for obj in objects if obj.type=='MESH'];metadata['triangles']=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in objects if obj.type=='MESH');metadata['fileBytes']=len(blob)
metadata['loadedAssets']=[a for a in metadata.get('loadedAssets',[]) if a.get('role')!='Shorts']+[{'filename':'MakeHuman body surface (CC0 derivative)','role':'CompressionShorts'}]
(OUT/'athlete-dressed-rig.json').write_text(json.dumps(metadata,indent=2))
# Machine-check that every joint transform remains identical to the active GLB.
active=(ROOT/'public/models/athlete/athlete.glb').read_bytes();n=struct.unpack_from('<I',active,12)[0];active_json=json.loads(active[20:20+n])
old_nodes={node.get('name'):node for node in active_json['nodes']}
for node in gltf['nodes']:
 if node.get('name') in metadata['bones']:
  old=old_nodes[node['name']]
  for field in ['translation','rotation','scale','matrix']:
   assert old.get(field)==node.get(field),(node['name'],field,old.get(field),node.get(field))
credits=json.loads((ROOT/'public/models/athlete/credits.json').read_text())
credits[0]['changes']='Character shape generated with MPFB 2.0.18, modelling targets baked, helper geometry removed, model and skeleton normalised to 1.78 metres, textures prepared for PBR web export. Fitted charcoal compression shorts are a new shell derived from the CC0 body surface with identical skin weights; body skin below the old loose shorts restored.'
for credit in credits:
 if 'elvs_male_athletic_tank1' in credit['name']:
  credit['changes']='Fitted to generated athlete, skinned to GameEngine skeleton, garment mesh reduced for real-time rendering, lower hem leg influences reassigned to pelvis for deep hip flexion, material exported as opaque PBR. Source header records CC-by without a version number; that declaration is preserved here.'
credits=[entry for entry in credits if 'elvs_male_swim_shorts1' not in entry['name']]
(OUT/'athlete-dressed-credits.json').write_text(json.dumps(credits,indent=2,ensure_ascii=False),encoding='utf-8')
print('CANDIDATE',len(blob),'bytes',metadata['triangles'],'triangles','BONE_TRANSFORMS_IDENTICAL',flush=True)

