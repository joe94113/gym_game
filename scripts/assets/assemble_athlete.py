"""Assemble licensed skinned clothing, PBR textures and an export-ready athlete."""
import bpy,sys,os,json,math,runpy,struct
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
ROOT=Path(__file__).resolve().parents[2]
runpy.run_path(str(ROOT/'scripts/assets/build_athlete.py'),run_name='__asset_build__')
from mpfb.services.humanservice import HumanService
from mpfb.services.exportservice import ExportService
from mpfb.services.objectservice import ObjectService
TOOL=ROOT/'.local-tools'; ASSETS=TOOL/'asset-data';OUTPUT=ROOT/'public/models/athlete'
human=bpy.data.objects['FORM_Athlete_Body']
rig=bpy.data.objects['FORM_Athlete_Rig']

def asset(name):
 found=list(ASSETS.rglob(name))
 if not found:raise RuntimeError('Missing selected asset '+name)
 return str(found[0])
HumanService.set_character_skin(asset('young_asian_male.mhmat'),human,skin_type='GAMEENGINE',material_instances=False)
loaded=[]
items=[('low-poly.mhclo','Eyes','Eyes'),('eyebrow001.mhclo','Eyebrows','Eyebrows'),('eyelashes01.mhclo','Eyelashes','Eyelashes'),('short01.mhclo','Hair','Hair')]
items.append(('elvs_male_athletic_tank1.mhclo' if list(ASSETS.rglob('elvs_male_athletic_tank1.mhclo')) else 'elvs_crude_t-shirt_male.mhclo','Clothes','Top'))
items.append(('elvs_male_swim_shorts1.mhclo' if list(ASSETS.rglob('elvs_male_swim_shorts1.mhclo')) else 'mindfront_male_swimming_trunks_01.mhclo','Clothes','Shorts'))
items.append(('punkduck_running_shoes_01.mhclo','Clothes','Shoes'))
for filename,kind,name in items:
 print('ADD_ASSET',filename,flush=True)
 result=HumanService.add_mhclo_asset(asset(filename),human,asset_type=kind,material_type='GAMEENGINE',subdiv_levels=0)
 if result is not None and hasattr(result,'name'):result.name='Athlete_'+name
 loaded.append({'filename':filename,'role':name})

export_root=ExportService.create_character_copy(human,name_suffix='_export')
export_body=ObjectService.find_object_of_type_amongst_nearest_relatives(export_root,'Basemesh')
# Export the visible fitted human, not the unshaped template plus hundreds of
# Blender-only modelling targets. This is required before topology masks bake.
for obj in [export_root]+ObjectService.get_list_of_children(export_root):
 if obj.type=='MESH' and obj.data.shape_keys:
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
  bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
ExportService.bake_modifiers_remove_helpers(export_body,bake_masks=True,bake_subdiv=False,remove_helpers=True,also_proxy=True)
objects=[export_root]+ObjectService.get_list_of_children(export_root)
for obj in objects:
 if obj.type=='MESH':
  for modifier in list(obj.modifiers):
   if modifier.type=='SUBSURF':obj.modifiers.remove(modifier)
  for poly in obj.data.polygons:poly.use_smooth=True
  # The sourced tank contains dense sculpted folds. Collapse only this garment,
  # retaining the authored body/face topology and original skin weights.
  if 'Athlete_Top' in obj.name and len(obj.data.vertices)>12000:
   bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
   reduction=obj.modifiers.new('Web garment optimisation','DECIMATE');reduction.ratio=.18
   bpy.ops.object.modifier_apply(modifier=reduction.name)
  # Asset rendering stays PBR; MakeHuman procedural renderer nodes are not shipped.
  for material in obj.data.materials:
   if not material or not material.use_nodes:continue
   for node in material.node_tree.nodes:
    if node.type=='BSDF_PRINCIPLED':
     node.inputs['Metallic'].default_value=0.0
     if 'skin' in material.name.lower() or obj==export_body:node.inputs['Roughness'].default_value=.65
     if 'Athlete_Shorts' in obj.name:
      for link in list(node.inputs['Base Color'].links):material.node_tree.links.remove(link)
      node.inputs['Base Color'].default_value=(.035,.055,.045,1)
      node.inputs['Roughness'].default_value=.88
  for modifier in obj.modifiers:
   if modifier.type=='ARMATURE':modifier.use_deform_preserve_volume=False

# The true root transform normalises geometry and all bones, not only metadata.
bpy.context.view_layer.update()
points=[obj.matrix_world@vertex.co for obj in objects if obj.type=='MESH' for vertex in obj.data.vertices]
minimum=min(p.z for p in points); maximum=max(p.z for p in points)
factor=1.78/(maximum-minimum)
normaliser=bpy.data.objects.new('FORM_Athlete',None);bpy.context.scene.collection.objects.link(normaliser)
normaliser.scale=(factor,factor,factor);normaliser.location.z=-minimum*factor
export_root.parent=normaliser
normaliser['source']='MakeHuman MPFB 2.0.18'
normaliser['asset_kind']='licensed_continuous_skinned_human'
bpy.context.view_layer.update()

# Resize only through Blender's asset export pipeline, preserving UV relationships.
for image in bpy.data.images:
 if image.type=='IMAGE' and image.size[0]>2048:
  ratio=2048/image.size[0];image.scale(2048,max(1,int(image.size[1]*ratio)))
  image.pack()

rig_export=export_root if export_root.type=='ARMATURE' else next(obj for obj in objects if obj.type=='ARMATURE')
bpy.ops.object.select_all(action='DESELECT');normaliser.select_set(True)
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=normaliser
filename=OUTPUT/'athlete-next.glb'
bpy.ops.export_scene.gltf(filepath=str(filename),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_morph=False,export_animations=False,export_skins=True,export_extras=True,export_materials='EXPORT',export_image_format='AUTO')
bpy.ops.wm.save_as_mainfile(filepath=str(TOOL/'athlete-final.blend'))

# Read exported GLB node transforms so runtime receives exact GLTF coordinates.
blob=filename.read_bytes();json_length,json_kind=struct.unpack_from('<II',blob,12);gltf=json.loads(blob[20:20+json_length])
# MPFB's GameEngine material declares every surface BLEND, including opaque
# skin and clothes. That loses depth writes and sorts back-facing hair/clothes
# over the face/body in web viewers. Export explicit, physically correct modes.
for material in gltf.get('materials',[]):
 name=material.get('name','').lower()
 if any(term in name for term in ['eyebrow','eyelash','short01']):
  material['alphaMode']='MASK';material['alphaCutoff']=.4;material['doubleSided']=True
 else:
  material['alphaMode']='OPAQUE';material.pop('alphaCutoff',None);material['doubleSided']=False
payload=json.dumps(gltf,separators=(',',':')).encode('utf8');payload+=b' '*((-len(payload))%4)
binary=blob[20+json_length:]
blob=struct.pack('<III',0x46546c67,2,20+len(payload)+len(binary))+struct.pack('<II',len(payload),0x4e4f534a)+payload+binary
filename.write_bytes(blob)
nodes=gltf['nodes'];parents={child:index for index,node in enumerate(nodes) for child in node.get('children',[])}
worlds={}
def node_world(index):
 if index in worlds:return worlds[index]
 node=nodes[index]
 if 'matrix' in node:
  a=node['matrix'];local=Matrix([[a[c*4+r] for c in range(4)] for r in range(4)])
 else:
  q=node.get('rotation',[0,0,0,1]);local=Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),Quaternion((q[3],q[0],q[1],q[2])),Vector(node.get('scale',[1,1,1])))
 world=node_world(parents[index])@local if index in parents else local;worlds[index]=world;return world
names={node.get('name'):index for index,node in enumerate(nodes)}
semantics={'root':'Root','hips':'pelvis','spine':'spine_01','chest':'spine_03','neck':'neck_01','head':'head','leftUpperArm':'upperarm_l','leftLowerArm':'lowerarm_l','leftHand':'hand_l','rightUpperArm':'upperarm_r','rightLowerArm':'lowerarm_r','rightHand':'hand_r','leftUpperLeg':'thigh_l','leftLowerLeg':'calf_l','leftFoot':'foot_l','leftToes':'ball_l','rightUpperLeg':'thigh_r','rightLowerLeg':'calf_r','rightFoot':'foot_r','rightToes':'ball_r'}
bones={}
for bone in rig_export.data.bones:
 index=names.get(bone.name)
 if index is None:
  index=next((i for name,i in names.items() if name and name.startswith(bone.name+'_')),None)
 if index is None:continue
 world=node_world(index);head=world.translation;tail_world=rig_export.matrix_world@bone.tail_local
 tail=[tail_world.x,tail_world.z,-tail_world.y]
 bones[bone.name]={'nodeName':nodes[index]['name'],'parent':bone.parent.name if bone.parent else None,'head':list(head),'tail':tail,'worldQuaternion':list(world.to_quaternion())[1:]+[world.to_quaternion().w],'restMatrix':list(sum(([float(world[r][c]) for r in range(4)] for c in range(4)),[]))}
body_meshes=[obj for obj in objects if obj.type=='MESH']
triangles=sum(sum(len(poly.vertices)-2 for poly in obj.data.polygons) for obj in body_meshes)
meta={'source':'MakeHuman MPFB 2.0.18','height':1.78,'coordinateSystem':{'up':'+Y','forward':'+Z','units':'metres'},'semanticBones':semantics,'bones':bones,'restBonePositions':{name:bone['head'] for name,bone in bones.items()},'meshNames':[obj.name for obj in body_meshes],'triangles':triangles,'loadedAssets':loaded,'fileBytes':len(blob),'normalisation':{'factor':factor,'rawHeight':maximum-minimum}}
(OUTPUT/'rig-next.json').write_text(json.dumps(meta,indent=2))
print('EXPORTED',filename,len(blob),'bytes',triangles,'triangles','height',1.78,flush=True)
