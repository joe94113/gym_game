// Preload only the new qualification process. Production has no test settings.
import {rig} from './dumbbell-test-helpers.mjs';
const value=JSON.parse(process.env.STRAIGHT_ARM_SETTINGS_V020||'null');
if(!value||!rig.setEquipmentSettings('cable-straight-arm-pulldown',value).ok)throw Error('Invalid straight-arm qualification settings');
