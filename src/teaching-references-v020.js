import {teachingReferenceChecks,TEACHING_REFERENCE_DATE} from './teaching-reference-data-v020.js';

export const TEACHING_SOURCE_KINDS=Object.freeze({
  direct_instruction:'同類器材動作教學',
  partial_instruction:'局部操作參考',
  related_variant:'相關變式參考',
  equipment_only:'器材資料',
  course_type:'課程形式參考',
  unverified:'尚待核對來源',
});
const byId=new Map(teachingReferenceChecks.map(row=>[row.id,row]));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function teachingReferenceFor(activity){return byId.get(typeof activity==='string'?activity:activity?.movementId||activity?.id)||null;}
export function withTeachingReference(activity){
  const row=teachingReferenceFor(activity);
  return row?.source?.url&&row.kind!=='unverified'?{...activity,source:{label:row.source.label,url:row.source.url}}:activity;
}
export function teachingReferenceSummary(catalog){
  const items=catalog.filter(item=>item.runtime!=='facility'||item.classKind);
  const counts=Object.fromEntries(Object.keys(TEACHING_SOURCE_KINDS).map(kind=>[kind,0]));let animationIssues=0;
  for(const item of items){const row=teachingReferenceFor(item);counts[row?.kind||'unverified']++;if(row?.animation?.status==='needs-work')animationIssues++;}
  return{total:items.length,checked:items.length-counts.unverified,counts,animationIssues,checkedOn:TEACHING_REFERENCE_DATE,professionalSignoff:false};
}
export function teachingReferenceMarkup(activity){
  const row=teachingReferenceFor(activity);if(!row)return '';
  const sources=row.sources?.length?row.sources:[row.source].filter(Boolean);
  const link=source=>`<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)} ↗</a>`;
  return `<details class="public-teaching-reference" data-teaching-reference="${escape(row.id)}"><summary>公開教學對照 · ${escape(TEACHING_SOURCE_KINDS[row.kind])}</summary><p>${escape(row.scope)}</p>${row.checkedParts?.length?`<p><strong>這次核對：</strong>${escape(row.checkedParts.join('、'))}</p>`:''}${row.cues?.length?`<ul>${row.cues.map(cue=>`<li>${escape(cue)}</li>`).join('')}</ul>`:''}${row.gaps?.length?`<p><strong>未涵蓋：</strong>${escape(row.gaps.join('；'))}</p>`:''}${row.animation?.status==='needs-work'?`<p class="teaching-follow-up"><strong>動畫待修：</strong>${escape(row.animation.notes)}</p>`:row.animation?.status==='corrected-checked'?`<p><strong>動畫校正：</strong>${escape(row.animation.notes)}</p>`:''}<p>${sources.map(link).join(' · ')}</p><small>資料核對：${escape(row.checkedOn)}。來源核對與動畫檢查分開記錄。</small></details>`;
}
