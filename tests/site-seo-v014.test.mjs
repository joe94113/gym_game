import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {siteConfig,metadata,sitePath} from '../site/config.mjs';
import {publicPages,discoveryFiles,groupedActivities} from '../site/pages.mjs';
import {catalogActivities} from '../src/activity-catalog.js';

const production=siteConfig({VITE_SITE_URL:'https://test-owner.github.io/gym-game/'});
test('local builds have noindex and do not invent public canonical URLs or sitemaps',()=>{
  const site=siteConfig(),head=metadata(site),files=discoveryFiles(site,publicPages(site));
  assert.match(head,/noindex, nofollow/);assert.doesNotMatch(head,/rel="canonical"|og:url|application\/ld\+json/);
  assert.equal(files.has('sitemap.xml'),false);assert.match(files.get('robots.txt'),/Disallow: \//);
});
test('public project and custom domain URLs produce their correct asset base',()=>{
  assert.equal(production.base,'/gym-game/');assert.equal(production.url,'https://test-owner.github.io/gym-game/');
  assert.equal(siteConfig({VITE_SITE_URL:'https://gym.test'}).base,'/');
  assert.equal(siteConfig({VITE_BASE_PATH:'/preview/'}).indexable,false);
  const head=metadata(production);assert.match(head,/canonical" href="https:\/\/test-owner.github.io\/gym-game\/"/);assert.match(head,/content="index, follow/);assert.match(head,/https:\/\/test-owner.github.io\/gym-game\/social-card.png/);
});
test('invalid public URLs and escaping base paths fail instead of publishing incorrect SEO',()=>{
  for(const value of ['http://gym.test/','https://localhost/','https://gym.test/?q=1','https://gym.test/#a','https://user:password@gym.test/'])assert.throws(()=>siteConfig({VITE_SITE_URL:value}));
  for(const value of ['../x/','//other.test/','/x/../','/no-end','/has space/'])assert.throws(()=>siteConfig({VITE_BASE_PATH:value}));
});
test('readable guides cover each of the 65 learned movements exactly once',()=>{
  const ids=groupedActivities().flatMap(group=>group.items.map(item=>item.id)),expected=catalogActivities.filter(item=>item.runtime!=='facility'||item.classKind).map(item=>item.id);
  assert.equal(ids.length,65);assert.equal(new Set(ids).size,65);assert.deepEqual([...ids].sort(),expected.sort());
});
test('all published HTML has a unique title and one h1, valid truthful JSON-LD and a canonical',()=>{
  const pages=publicPages(production,{accountMode:'local'}),titles=new Set();
  assert.equal(pages.size,9);
  for(const [path,html]of pages){
    assert.equal([...html.matchAll(/<h1[ >]/g)].length,1,path);const title=html.match(/<title>(.*?)<\/title>/)[1];assert.equal(titles.has(title),false,path);titles.add(title);
    assert.match(html,/rel="canonical"/);assert.match(html,/og:locale" content="zh_TW/);
    for(const match of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)){const json=JSON.parse(match[1]);assert.equal(json['@context'],'https://schema.org');assert.doesNotMatch(match[1],/aggregateRating|reviewRating|MedicalWebPage/);}
    assert.match(html,path==='404.html'?/noindex, nofollow/:/index, follow/);
  }
  assert.match(pages.get('about/index.html'),/沒有帳號雲端同步/);
});
test('guide links and 65 interactive deep links stay inside the Pages project path',()=>{
  const pages=publicPages(production),paths=new Set(['',...pages.keys()]);let deepLinks=0;
  for(const [source,html]of pages)for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    const href=match[1];if(href.startsWith('#')||/^https?:/.test(href))continue;
    assert.equal(href.startsWith(production.base),true,source+' '+href);
    const url=new URL(href,'https://test-owner.github.io'),relative=url.pathname.slice(production.base.length);
    if(url.searchParams.has('exercise')){assert.ok(catalogActivities.some(e=>e.id===url.searchParams.get('exercise')));deepLinks++;}
    const target=relative.endsWith('/')?relative+'index.html':relative;
    assert.ok(paths.has(target)||relative===''||existsSync('public/'+relative),source+' missing '+relative);
  }
  assert.equal(deepLinks,65);assert.equal(sitePath(production,'guide/'),'/gym-game/guide/');
});
test('sitemap contains exactly the nine public canonical pages and no previews or 404',()=>{
  const pages=publicPages(production),xml=discoveryFiles(production,pages).get('sitemap.xml'),urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(item=>item[1]);
  assert.equal(urls.length,9);assert.equal(new Set(urls).size,9);assert.equal(urls.includes(production.url),true);
  assert.equal(urls.some(url=>url.includes('404')||url.includes('?')||url.includes('localhost')),false);
  assert.ok(urls.every(url=>url.startsWith(production.url)));
});
test('installation manifest is project-relative with separate square and maskable icons',()=>{
  const manifest=JSON.parse(readFileSync('public/site.webmanifest','utf8'));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  for(const icon of manifest.icons){assert.equal(icon.src.startsWith('/'),false);assert.ok(existsSync('public/'+icon.src));}
  assert.equal(manifest.icons.filter(icon=>icon.purpose==='maskable').length,2);
});
