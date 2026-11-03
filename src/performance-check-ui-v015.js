export function createPerformanceCheckUI({app,getWorld,onStart=()=>{},notify=()=>{}}){
  const state=()=>getWorld()?.getPerformanceCheckStatus?.()||{status:'idle'},download=()=>{
    const report=getWorld()?.getPerformanceCheckReport?.();if(!report)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`muscle-base-performance-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  app.addEventListener('click',event=>{const button=event.target.closest('[data-performance-action]');if(!button)return;const action=button.dataset.performanceAction;
    if(action==='start'){onStart();if(getWorld()?.startPerformanceCheck(20))notify('開始記錄 20 秒。照平常走動或使用器材，完成後會提醒。');}
    if(action==='download')download();
    if(action==='stop'){getWorld()?.stopPerformanceCheck();notify('已停止測量。');}
  });
  globalThis.addEventListener('form-performance-complete',event=>notify(event.detail==='complete'?'效能紀錄完成。到「操作說明 → 效能檢測」下載結果。':'效能紀錄已中斷，可到操作說明重新測量。'));
  return{markup(){const current=state(),summary=current.summary;
    return`<section class="performance-check" aria-label="效能檢測"><h3>在這台電腦測一下</h3><p>記錄實際遊玩的畫面間隔、顯示卡與畫質。開始後會關閉說明，請照平常操作 20 秒；全程留在遊戲分頁。</p>${summary?`<p><strong>平均 ${summary.meanMs.toFixed(1)} ms · p95 ${summary.p95Ms.toFixed(1)} ms</strong><br>超過 50 ms：${summary.over50Percent.toFixed(1)}% · ${summary.samples} 個畫格</p>`:''}${current.status==='interrupted'?`<p>上次測量已中斷，請重測。</p>`:''}<div class="journal-actions"><button class="secondary-button" data-performance-action="start" ${!getWorld()||current.status==='measuring'?'disabled':''}>${current.status==='measuring'?'正在記錄…':'開始 20 秒測量'}</button>${current.status==='measuring'?'<button class="secondary-button" data-performance-action="stop">停止測量</button>':''}${current.status==='complete'?'<button class="secondary-button" data-performance-action="download">下載效能紀錄 JSON</button>':''}</div><p class="teaching-note">資料保留在這個瀏覽器的記憶體，不會自動上傳。比較不同電腦時，請使用同畫質、視角與路線；自動畫質可能改變負載。這不是顯示卡的獨立跑分。</p></section>`;
  }};
}
