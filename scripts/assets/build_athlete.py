"""Build a sourced MakeHuman athlete; invoke with portable Blender --background."""
import bpy,sys,os,json,math
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
TOOL=ROOT/'.local-tools'
OUTPUT=ROOT/'public/models/athlete'
OUTPUT.mkdir(parents=True,exist_ok=True)
SOURCE=TOOL/'mpfb/mpfb2-2.0.18/src'
PROFILE=TOOL/'mpfb-user'
PROFILE.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(SOURCE))
original_extension_path_user=bpy.utils.extension_path_user
def extension_path_user(package,*args,**kwargs):
    if package=='mpfb':return str(PROFILE)
    return original_extension_path_user(package,*args,**kwargs)
bpy.utils.extension_path_user=extension_path_user
bpy.ops.preferences.addon_enable(module='mpfb')
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.assetservice import AssetService
from mpfb.services.locationservice import LocationService
from mpfb.services.exportservice import ExportService
from mpfb.services.objectservice import ObjectService

LocationService._user_data=str(TOOL/'asset-data')
LocationService._second_root=str(TOOL/'asset-data')
LocationService._user_home=str(PROFILE)
for path in ['data','cache','config','logs']:(PROFILE/path).mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
macro=TargetService.get_default_macro_info_dict()
macro.update({'gender':1.0,'age':.35,'muscle':.62,'weight':.44,'height':.50,'proportions':.5})
macro['race']={'asian':.55,'caucasian':.45,'african':0.0}
human=HumanService.create_human(macro_detail_dict=macro)
human.name='FORM_Athlete_Body'
rig=HumanService.add_builtin_rig(human,'game_engine')
rig.name='FORM_Athlete_Rig'
print('RIG_CREATED',len(rig.data.bones),flush=True)

def gltf_vec(v):return [float(v.x),float(v.z),float(-v.y)]
bones={}
for bone in rig.data.bones:
    matrix=rig.matrix_world @ bone.matrix_local
    bones[bone.name]={'parent':bone.parent.name if bone.parent else None,'head':gltf_vec(rig.matrix_world@bone.head_local),'tail':gltf_vec(rig.matrix_world@bone.tail_local),'restMatrixBlender':list(sum(([float(x) for x in row] for row in matrix),[]))}
metadata={'source':'MakeHuman MPFB 2.0.18 official GameEngine rig','coordinateSystem':{'up':'+Y','forward':'+Z','units':'metres'},'bones':bones,'semanticBones':{'root':'Root','hips':'pelvis','spine':'spine_01','chest':'spine_03','neck':'neck_01','head':'head','leftUpperArm':'upperarm_l','leftLowerArm':'lowerarm_l','leftHand':'hand_l','rightUpperArm':'upperarm_r','rightLowerArm':'lowerarm_r','rightHand':'hand_r','leftUpperLeg':'thigh_l','leftLowerLeg':'calf_l','leftFoot':'foot_l','leftToes':'ball_l','rightUpperLeg':'thigh_r','rightLowerLeg':'calf_r','rightFoot':'foot_r','rightToes':'ball_r'}}
(OUTPUT/'rig-provisional.json').write_text(json.dumps(metadata,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(TOOL/'athlete-base.blend'))
print('BASE_SAVED',flush=True)
