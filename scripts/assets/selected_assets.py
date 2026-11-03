"""Fetch selected licensed entries from official packs via HTTP ZIP ranges."""
import concurrent.futures,io,json,os,re,time,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.local-tools/asset-data'
OUT.mkdir(parents=True,exist_ok=True)
HEADERS={'User-Agent':'FORM-Gym-asset-build/1.0'}
class RemoteZip(io.RawIOBase):
 def __init__(self,url):
  self.url=url;self.pos=0
  r=urllib.request.urlopen(urllib.request.Request(url,method='HEAD',headers=HEADERS),timeout=30)
  self.size=int(r.headers['Content-Length'])
 def seekable(self):return True
 def seek(self,offset,whence=0):
  self.pos=offset if whence==0 else self.pos+offset if whence==1 else self.size+offset
  return self.pos
 def tell(self):return self.pos
 def read(self,size=-1):
  if size<0:size=self.size-self.pos
  if not size:return b''
  start=self.pos;end=min(self.size-1,start+size-1)
  req=urllib.request.Request(self.url,headers={**HEADERS,'Range':f'bytes={start}-{end}'})
  for attempt in range(3):
   try:
    with urllib.request.urlopen(req,timeout=45) as r:
     data=r.read()
    if len(data)!=end-start+1:raise ValueError(f'Bad range size {len(data)} expected{end-start+1}')
    self.pos+=len(data);return data
   except Exception:
    if attempt==2:raise
    time.sleep(1)

PACKS={'makehuman_system_assets':'cc0','shirts01':'cc0','pants03':'ccby','shoes02':'ccby','shirts03':'ccby'}
for name,suffix in PACKS.items():
 url=f'https://files.makehumancommunity.org/asset_packs/{name}/{name}_{suffix}.zip'
 z=zipfile.ZipFile(RemoteZip(url))
 names=z.namelist()
 (ROOT/f'.local-tools/{name}-entries.json').write_text(json.dumps(names,indent=2))
 print(name,'entries',len(names),flush=True)
 wanted=[]
 if name=='makehuman_system_assets':
  terms=['young_asian_male/','eyes/low-poly/','eyes/materials/brown','eyebrows/eyebrow001/','eyelashes/eyelashes01/','hair/short01/','shoes/shoes04/']
 elif name=='shirts01':terms=['elvs_crude_t-shirt_male/']
 elif name=='pants03':terms=['short','trunk']
 elif name=='shoes02':terms=['sneaker','running','sport']
 else:terms=['elvs_male_athletic_tank1/']
 for n in names:
  if any(term in n.lower() for term in terms) and not n.endswith('/') and not n.endswith(('.thumb','.png.bak')):wanted.append(n)
 print('SELECTED',name,wanted,flush=True)
 def fetch(entry):
  target=OUT/entry
  if target.exists():return
  # A separate central-directory reader avoids sharing seek state between threads.
  with zipfile.ZipFile(RemoteZip(url)) as remote:
   data=remote.read(entry)
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  print('ASSET',entry,len(data),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(fetch,wanted))
 print('PACK_DONE',name,flush=True)
