import bpy,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'.local-tools/athlete-final.blend'))
root=bpy.data.objects['FORM_Athlete']
def belongs(obj):
 p=obj
 while p:
  if p==root:return True
  p=p.parent
 return False
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':
  obj.hide_render=not belongs(obj)
  if belongs(obj):print('MESH_STATS',obj.name,len(obj.data.vertices),sum(len(p.vertices)-2 for p in obj.data.polygons),flush=True)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=720;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.color=(.28,.28,.28)
scene.view_settings.view_transform='AgX'
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.25,.28,.24,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
for location,power,size in [((2,-3,4),500,4),((-3,-1,3),350,3),((1,3,3),450,3)]:
 data=bpy.data.lights.new('Studio','AREA');obj=bpy.data.objects.new('Studio',data);scene.collection.objects.link(obj);obj.location=location;data.energy=power;data.shape='DISK';data.size=size;obj.rotation_euler=(Vector((0,0,.9))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('AssetPreview');camera=bpy.data.objects.new('AssetPreview',data);scene.collection.objects.link(camera);camera.location=(2.3,-5.4,2.0);camera.rotation_euler=(Vector((0,0,.92))-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.15;scene.camera=camera
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'artifacts/real-human-source-preview.png')
bpy.ops.render.render(write_still=True)
