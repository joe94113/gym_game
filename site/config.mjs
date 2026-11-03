export const SITE_NAME='肌動基地';
export const SITE_TITLE='肌動基地｜3D 健身房遊戲・器材與肌群教學';
export const SITE_DESCRIPTION='走進 3D 健身房，認識啞鈴、龍門架與槓片器材，從不同角度看動作與紅橘肌群標色。可自由探索、安排訓練、觀看七種團課，並記錄自己的運動。';

export function siteConfig(env={}){
  const configured=String(env.VITE_SITE_URL||'').trim();
  let url=null;
  if(configured){
    url=new URL(configured);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('VITE_SITE_URL 請填公開網站的完整 HTTPS 網址，不含查詢或錨點。');
    if(!url.pathname.endsWith('/'))url.pathname+='/';
  }
  const base=url?.pathname||String(env.VITE_BASE_PATH||'/');
  if(!base.startsWith('/')||!base.endsWith('/')||base.includes('..')||/[?#"<>\\\s]/.test(base)||base.startsWith('//'))throw Error('VITE_BASE_PATH 必須是以 / 開頭與結尾的站內路徑。');
  return{url:url?.href||null,base,indexable:!!url};
}

export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const sitePath=(site,path='')=>site.base+path.replace(/^\//,'');
export const siteURL=(site,path='')=>site.url?new URL(path,site.url).href:null;

export function metadata(site,{title=SITE_TITLE,description=SITE_DESCRIPTION,path='',type='website',schema}={}){
  const url=siteURL(site,path),image=siteURL(site,'social-card.png')||sitePath(site,'social-card.png');
  const structured=schema||(url&&path?{'@context':'https://schema.org','@type':'WebPage',name:title,description,url,inLanguage:'zh-Hant-TW',isPartOf:{'@id':`${site.url}#website`}}:url?{'@context':'https://schema.org','@graph':[
    {'@type':'WebSite','@id':`${site.url}#website`,name:SITE_NAME,alternateName:'MUSCLE BASE',url:site.url,inLanguage:'zh-Hant-TW'},
    {'@type':['VideoGame','WebApplication'],'@id':`${site.url}#game`,name:SITE_NAME,description:SITE_DESCRIPTION,url:site.url,image,applicationCategory:'GameApplication',operatingSystem:'支援 WebGL 的電腦與手機網頁瀏覽器',gamePlatform:'Web browser',inLanguage:'zh-Hant-TW',isAccessibleForFree:true},
  ]}:null);
  const meta=(property,value)=>`<meta ${property.startsWith('og:')?'property':'name'}="${property}" content="${escapeHTML(value)}">`;
  return`<title>${escapeHTML(title)}</title>
    ${meta('description',description)}
    ${meta('robots',site.indexable?'index, follow, max-image-preview:large':'noindex, nofollow')}
    ${url?`<link rel="canonical" href="${escapeHTML(url)}">`:''}
    ${meta('og:type',type)}${meta('og:site_name',SITE_NAME)}${meta('og:locale','zh_TW')}
    ${meta('og:title',title)}${meta('og:description',description)}${url?meta('og:url',url):''}
    ${meta('og:image',image)}${meta('og:image:width','1200')}${meta('og:image:height','630')}${meta('og:image:alt','肌動基地：3D 健身房，走進去就能學。')}
    ${meta('twitter:card','summary_large_image')}${meta('twitter:title',title)}${meta('twitter:description',description)}${meta('twitter:image',image)}${meta('twitter:image:alt','肌動基地：認識器材、看懂肌群、安排訓練。')}
    ${structured?`<script type="application/ld+json">${JSON.stringify(structured).replaceAll('<','\\u003c')}</script>`:''}`;
}

export function iconLinks(site){
  const asset=path=>escapeHTML(sitePath(site,path));
  return`<link rel="icon" href="${asset('favicon.svg')}" type="image/svg+xml">
    <link rel="icon" href="${asset('favicon-96.png')}" type="image/png" sizes="96x96">
    <link rel="apple-touch-icon" href="${asset('apple-touch-icon.png')}" sizes="180x180">
    <link rel="manifest" href="${asset('site.webmanifest')}">`;
}
