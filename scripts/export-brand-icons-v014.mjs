import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

// Raster exports use existing vector artwork; no image-generation service or game scene.
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const preserved=['public/brand-mark.svg','public/icon-192.png','public/icon-512.png'];
const preservedHashes=Object.fromEntries(preserved.map(path=>[path,sha(readFileSync(path))]));
const brand=readFileSync('public/brand-mark.svg','utf8');
const art=brand.replace(/<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'').replace(/<rect\b[^>]*\/>/,'');
const square=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#172a27"/><g transform="translate(256 256) scale(.9) translate(-256 -256)">${art}</g></svg>`;
const favicon=readFileSync('public/favicon.svg','utf8');
const social=readFileSync('public/social-card.svg','utf8');
const exports=[
 {path:'public/favicon-48.png',width:48,height:48,svg:favicon},
 {path:'public/favicon-96.png',width:96,height:96,svg:favicon},
 {path:'public/apple-touch-icon.png',width:180,height:180,svg:square,fullBleed:true},
 {path:'public/icon-maskable-192.png',width:192,height:192,svg:square,fullBleed:true,safeZone:true},
 {path:'public/icon-maskable-512.png',width:512,height:512,svg:square,fullBleed:true,safeZone:true},
 {path:'public/social-card.png',width:1200,height:630,svg:social,fullBleed:true},
];
const browser=await chromium.launch({headless:true,executablePath:config.use.launchOptions.executablePath,args:['--disable-gpu']});
const results=[];
try{
 const page=await browser.newPage({viewport:{width:1200,height:700},deviceScaleFactor:1});
 await page.setContent('<!doctype html><html><head><meta charset="UTF-8"></head><body></body></html>');
 for(const asset of exports){
  const exported=await page.evaluate(async({svg,width,height})=>{
   const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await img.decode();
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,width,height);
   const rgba=ctx.getImageData(0,0,width,height).data;let transparentPixels=0,foregroundPixels=0,maxForegroundRadius=0;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;if(rgba[i+3]!==255)transparentPixels++;
    if(rgba[i+3]>0&&Math.max(Math.abs(rgba[i]-23),Math.abs(rgba[i+1]-42),Math.abs(rgba[i+2]-39))>0){foregroundPixels++;maxForegroundRadius=Math.max(maxForegroundRadius,Math.hypot(x+.5-width/2,y+.5-height/2));}
   }
   return{base64:canvas.toDataURL('image/png').split(',')[1],width,height,transparentPixels,foregroundPixels,maxForegroundRadius,safeRadius:.4*Math.min(width,height)};
  },asset);
  if(asset.fullBleed&&exported.transparentPixels)throw Error(`Full-bleed background has transparency: ${asset.path}`);
  if(asset.safeZone&&exported.maxForegroundRadius>exported.safeRadius)throw Error(`Artwork exceeds central 80% safe circle: ${asset.path}`);
  writeFileSync(asset.path,Buffer.from(exported.base64,'base64'));
  const {base64,...metrics}=exported;results.push({path:asset.path,sha256:sha(readFileSync(asset.path)),...metrics,fullBleed:!!asset.fullBleed,maskableSafeZone:!!asset.safeZone});
 }
}finally{await browser.close()}
const changedPreserved=preserved.filter(path=>preservedHashes[path]!==sha(readFileSync(path)));
if(changedPreserved.length)throw Error('Original brand assets changed: '+changedPreserved.join(', '));
const folder='artifacts/seo-v014/icon-review';mkdirSync(folder,{recursive:true});
const report={pass:true,exportedAt:new Date().toISOString(),exporterSHA256:sha(readFileSync('scripts/export-brand-icons-v014.mjs')),preservedHashes,changedPreserved,sourceHashes:{'public/favicon.svg':sha(readFileSync('public/favicon.svg')),'public/social-card.svg':sha(readFileSync('public/social-card.svg'))},results,scope:'Existing vector artwork exported using Chromium canvas. The original main logo and standard app icons are preserved byte-for-byte. Maskable foreground pixels fit within the centered 80% diameter safe circle; full-bleed exports are opaque.'};
writeFileSync(`${folder}/exports.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,exports:results.map(item=>({path:item.path,width:item.width,height:item.height,maxForegroundRadius:item.maskableSafeZone?item.maxForegroundRadius:undefined,safeRadius:item.maskableSafeZone?item.safeRadius:undefined})),preserved:preserved.length}));
