import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicAssetUrl} from '../src/asset-url.js';

test('public model, audio and portrait assets stay under the published Pages directory',()=>{
  const origin='https://athlete.github.io',directory='/gym-game/';
  for(const path of ['models/athlete/athlete.glb','models/athlete/rig.json','models/athlete/lod-v010/manifest.json','models/athlete/lod-v010/indices.bin','audio/course-voice/cue.wav','images/coaches/coach-roster-atlas.png']){
    assert.equal(new URL(publicAssetUrl(path,directory),origin).href,origin+directory+path);
    assert.equal(publicAssetUrl('/'+path,directory.slice(0,-1)),directory+path);
    assert.equal(publicAssetUrl(path),'/'+path);
  }
  for(const url of ['https://cdn.example.org/model.glb','//cdn.example.org/image.png','data:image/png;base64,AAAA','blob:https://example.org/id','#section'])assert.equal(publicAssetUrl(url,directory),url);
});

test('installed app manifest resolves icons, scope and launch within root and Pages project URLs',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/site.webmanifest',import.meta.url),'utf8'));
  for(const base of ['https://athlete.github.io/','https://athlete.github.io/gym-game/']){
    const url=new URL('site.webmanifest',base);
    assert.equal(new URL(manifest.start_url,url).href,base);
    assert.equal(new URL(manifest.scope,url).href,base);
    for(const icon of manifest.icons)assert.ok(new URL(icon.src,url).href.startsWith(base));
  }
});
