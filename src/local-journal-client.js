import {normalizeSnapshot} from './training-journal-data.js';

const KEY='form.account-data.v1:guest',clone=value=>JSON.parse(JSON.stringify(value));
/** Static hosts keep guest records locally and never create an account request. */
export function createLocalJournalClient({storage=globalThis.localStorage,getProgress=()=>({}),getProfile=()=>({}),onChange=()=>{}}={}){
 let persistent=true,disposed=false,snapshot;
 try{const probe=`${KEY}:probe`;storage.setItem(probe,'1');storage.removeItem(probe);snapshot=normalizeSnapshot(JSON.parse(storage.getItem(KEY)||'null')?.snapshot||{});}catch{persistent=false;snapshot=normalizeSnapshot();}
 const getState=()=>({snapshot:clone(snapshot),baseSnapshot:normalizeSnapshot(),user:null,available:false,status:'local',error:'',conflict:null,persistent,version:0,dirty:false,lastSyncedAt:null});
 const emit=()=>{if(!disposed)onChange(getState());};
 const save=()=>{if(disposed)return;try{storage.setItem(KEY,JSON.stringify({snapshot,baseSnapshot:normalizeSnapshot(),version:0,dirty:false,lastSyncedAt:null}));}catch{persistent=false;}emit();};
 function captureLearningState(){if(disposed)return false;const progress=getProgress()||{},next=normalizeSnapshot({...snapshot,learned:progress.learned??snapshot.learned,knowledge:progress.knowledge??snapshot.knowledge,profile:getProfile()||snapshot.profile});if(JSON.stringify(next)===JSON.stringify(snapshot))return false;snapshot=next;save();return true;}
 const ready=Promise.resolve().then(()=>captureLearningState());
 return{ready,getState,getSnapshot:()=>clone(snapshot),updateSnapshot(value){if(disposed)return;snapshot=normalizeSnapshot(value);save();},captureLearningState,async sync(){captureLearningState();return{status:'local'};},
  getDiagnostics:()=>({accountMode:'local',user:null,available:false,status:'local',version:0,entries:snapshot.entries.filter(entry=>!entry.deleted).length,dirty:false,conflict:false,persistent,lastSyncedAt:null}),
  dispose(){disposed=true;},
 };
}
