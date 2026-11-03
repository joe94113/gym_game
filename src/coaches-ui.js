export function coachesMarkup(roster=[]) {
  return `<p class="modal-description">16 位虛構教練，各有不同的訓練專長。也可以走到入口櫃台後方，看看介紹牆。</p><div class="coach-roster-grid">${roster.map(coach=>`<article class="coach-roster-card"><div class="coach-portrait" role="img" aria-label="${coach.name}教練的虛構頭像" style="background-position:${coach.portraitCol*100/3}% ${coach.portraitRow*100/3}%"></div><div><small>COACH ${String(coach.portraitIndex+1).padStart(2,'0')}</small><h3>${coach.name}</h3><p>${coach.specialty}</p></div></article>`).join('')}</div>`;
}
