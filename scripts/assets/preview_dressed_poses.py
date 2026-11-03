"""Render candidate in exact runtime deep-flexion poses from three directions."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'.local-tools/athlete-dressed-candidate.blend'))
rig=bpy.data.objects['FORM_Athlete_Rig_export'];root=bpy.data.objects['FORM_Athlete']
meta=json.loads((ROOT/'public/models/athlete/rig.json').read_text())
conversion=Matrix.Rotation(math.pi/2,4,'X')
def mat(a):return Matrix([[a[c*4+r] for c in range(4)] for r in range(4)])
for name,info in meta['bones'].items():
 delta=conversion@mat(info['restMatrix']) - rig.matrix_world@rig.data.bones[name].matrix_local
 assert max(abs(x) for row in delta for x in row)<2e-5,(name,delta)
print('COORDINATE_CONVERSION_VERIFIED',flush=True)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=600;scene.render.resolution_y=680;scene.render.resolution_percentage=100
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.38,.33,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
for location,power,size in [((2,-3,4),500,4),((-3,-1,3),350,3),((1,3,3),450,3)]:
 data=bpy.data.lights.new('DressedStudio','AREA');obj=bpy.data.objects.new('DressedStudio',data);scene.collection.objects.link(obj);obj.location=location;data.energy=power;data.shape='DISK';data.size=size;obj.rotation_euler=(Vector((0,0,.9))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('DressedCamera');camera=bpy.data.objects.new('DressedCamera',data);scene.collection.objects.link(camera);data.type='ORTHO';data.ortho_scale=1.65;scene.camera=camera
for exercise in ['kneeling-hip-flexor-stretch','dumbbell-bench-press']:
 pose=json.loads((ROOT/f'artifacts/skinned-pose-{exercise}.json').read_text())
 for bone in rig.pose.bones:
  bone.matrix=rig.matrix_world.inverted()@conversion@mat(pose['bones'][bone.name]['modelMatrix'])
  bpy.context.view_layer.update()
 for direction,location in [('front',(1.8,-4,1.7)),('side',(4,-.1,1.3)),('back',(-1.8,4,1.7))]:
  target=Vector((0,0,.65 if 'stretch' in exercise else .5));camera.location=location;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
  scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/f'artifacts/dressed-{exercise}-{direction}.png');bpy.ops.render.render(write_still=True)

