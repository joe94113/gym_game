import {gymLayout} from './gym-layout.js';

const scale=9;
const mx=x=>(x-gymLayout.bounds.minX)*scale;
const mz=z=>(z-gymLayout.bounds.minZ)*scale;
const width=(gymLayout.bounds.maxX-gymLayout.bounds.minX)*scale;
const height=(gymLayout.bounds.maxZ-gymLayout.bounds.minZ)*scale;

export function mapMarkup(stations,targetId,completed=new Set(),big=false) {
  const zones=gymLayout.zones.map(zone=>`<g class="map-zone"><rect x="${mx(zone.x)}" y="${mz(zone.z)}" width="${zone.w*scale}" height="${zone.d*scale}" rx="4" fill="${zone.color}"/><text x="${mx(zone.x)+zone.w*scale/2}" y="${mz(zone.z)+12}" text-anchor="middle" class="map-zone-label">${zone.name}</text></g>`).join('');
  const room=(x,z,w,d)=>`<rect x="${mx(x)}" y="${mz(z)}" width="${w*scale}" height="${d*scale}" rx="2" fill="none" stroke="#a2b4b3" stroke-width="1.2"/>`;
  return `<svg class="floor-map ${big?'big-map':''}" viewBox="-8 -8 ${width+16} ${height+16}" aria-label="健身房平面地圖：自由重量、固定器材、槓片、有氧、草皮與三溫暖分區" role="img">
    <rect width="${width}" height="${height}" rx="10" fill="#e9ece4"/>
    ${zones}
    <path d="M${mx(-9)} ${mz(-15)}V${mz(22)}M${mx(10)} ${mz(-15)}V${mz(23)}M${mx(-35)} ${mz(8)}H${mx(27)}" stroke="#f9faf4" stroke-width="8" fill="none"/>
    ${room(16,20.3,5.7,3.6)}${room(16,16.7,5.7,3.6)}${room(16,13.1,5.7,3.6)}
    ${room(23.5,13.9,4,4.2)}${room(23.5,18.9,4,4.2)}${room(18,8.25,4,3.55)}${room(23,8.25,4.4,3.55)}
    <path d="M${mx(-1)} ${mz(23.8)}h${4*scale}" stroke="#839b5e" stroke-width="5"/>
    <path class="map-route" data-map-route stroke="#647c3d" stroke-width="2" stroke-dasharray="5 5" fill="none"/>
    ${stations.map(station=>{
      const selected=targetId===station.id,learned=completed.has(station.id),facility=station.type==='facility';
      const fill=learned?'#8a9e69':selected?'#a2bf67':facility?'#638f96':station.plateLoaded?'#a18765':'#647568';
      const shortName=station.name.replace(/槓片式|坐姿|訓練機/g,'').slice(0,8);
      return `<g ${big?`data-map-station="${station.id}" tabindex="0" role="button" aria-label="導航至${station.name}"`:''} class="map-station ${selected?'is-target':''}" transform="translate(${mx(station.position.x)} ${mz(station.position.z)})"><circle r="${big?9:6.5}" fill="${fill}" stroke="#f8f9f4" stroke-width="1.8"/><text y="3" text-anchor="middle" fill="white" font-size="${big?8:6}" font-weight="700">${learned?'✓':station.number}</text>${big?`<text y="21" text-anchor="middle" class="map-machine-label">${shortName}</text>`:''}</g>`;
    }).join('')}
    <g data-map-player><circle r="9" fill="#fcfcf4" stroke="#53633c" stroke-width="1.8"/><path d="m0-7 4 10-4-2-4 2Z" fill="#53633c" data-map-heading/></g>
  </svg>`;
}

export function updateMaps(position,heading,target) {
  const x=mx(position.x),z=mz(position.z);
  document.querySelectorAll('[data-map-player]').forEach(element=>element.setAttribute('transform',`translate(${x} ${z})`));
  document.querySelectorAll('[data-map-heading]').forEach(element=>element.setAttribute('transform',`rotate(${180-heading*180/Math.PI})`));
  document.querySelectorAll('[data-map-route]').forEach(element=>element.setAttribute('d',target?`M${x} ${z}L${mx(target.position.x)} ${mz(target.position.z)}`:''));
}
