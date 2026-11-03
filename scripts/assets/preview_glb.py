import bpy,runpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/athlete/athlete-next.glb'))
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=720;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.25,.28,.24,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
for location,power,size in [((2,-3,4),500,4),((-3,-1,3),350,3),((1,3,3),450,3)]:
 data=bpy.data.lights.new('Studio','AREA');obj=bpy.data.objects.new('Studio',data);scene.collection.objects.link(obj);obj.location=location;data.energy=power;data.shape='DISK';data.size=size;obj.rotation_euler=(Vector((0,0,.9))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('AssetPreview');camera=bpy.data.objects.new('AssetPreview',data);scene.collection.objects.link(camera);camera.location=(2.3,-5.4,2.0);camera.rotation_euler=(Vector((0,0,.92))-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.15;scene.camera=camera
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'artifacts/real-human-glb-raw-preview.png')
bpy.ops.render.render(write_still=True)
