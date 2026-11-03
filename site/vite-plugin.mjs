import {metadata,iconLinks} from './config.mjs';
import {publicPages,discoveryFiles,homeFallback} from './pages.mjs';

export function seoPlugin(site,{accountMode='server'}={}){
  const pages=publicPages(site,{accountMode}),files=new Map([...pages,...discoveryFiles(site,pages)]);
  return{
    name:'muscle-base-public-pages',
    transformIndexHtml:{order:'post',handler:html=>html.replace('<!-- site:metadata -->',metadata(site)).replace('<!-- site:icons -->',iconLinks(site)).replace('<!-- site:fallback -->',homeFallback(site))},
    generateBundle(){for(const [fileName,source]of files)this.emitFile({type:'asset',fileName,source});},
    configureServer(server){server.middlewares.use((req,res,next)=>{
      const parsed=new URL(req.url,'http://local.test'),path=parsed.pathname;if(!path.startsWith(site.base))return next();
      const relative=path.slice(site.base.length),directory=['guide','about',...pages.keys()].some(key=>key===relative||key===relative+'/index.html');
      if(directory&&!relative.endsWith('/')&&!relative.includes('.')){res.writeHead(308,{Location:path+'/'+parsed.search});res.end();return;}
      const key=relative.endsWith('/')?relative+'index.html':relative;
      if(!files.has(key)){
        if(relative==='sitemap.xml'||relative.startsWith('guide/')||relative.startsWith('about/')){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(pages.get('404.html'));return;}
        return next();
      }
      const type=key.endsWith('.xml')?'application/xml; charset=utf-8':key.endsWith('.txt')?'text/plain; charset=utf-8':'text/html; charset=utf-8';
      res.writeHead(key==='404.html'?404:200,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:files.get(key));
    });},
  };
}
