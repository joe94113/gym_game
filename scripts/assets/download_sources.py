import concurrent.futures, json, os, re, urllib.request, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'.local-tools'
CACHE.mkdir(exist_ok=True)
HEADERS={'User-Agent':'FORM-Gym-asset-build/1.0'}
def fetch(url,dest):
    dest=Path(dest)
    if dest.exists() and dest.stat().st_size>10000:
        print('Cached',dest.name,flush=True);return dest
    print('Downloading',url,flush=True)
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=120) as inp, open(str(dest)+'.partial','wb') as out:
        while True:
            data=inp.read(1024*1024)
            if not data:break
            out.write(data)
    os.replace(str(dest)+'.partial',dest)
    print('Downloaded',dest.name,dest.stat().st_size,flush=True)
    return dest

urls={
 'blender.zip':'https://download.blender.org/release/Blender4.5/blender-4.5.15-windows-x64.zip',
 'mpfb-source.zip':'https://codeload.github.com/makehumancommunity/mpfb2/zip/refs/tags/v2.0.18',
}
for name in ['makehuman_system_assets','shirts01','pants01','shoes01']:
    page=urllib.request.urlopen(urllib.request.Request('https://static.makehumancommunity.org/assets/assetpacks/'+name+'.html',headers=HEADERS),timeout=30).read().decode()
    links=re.findall(r'href="([^"]+)"',page)
    mirrors=[link for link in links if '.zip' in link and 'makehumancommunity.org' in link]
    print(name,mirrors,flush=True)
    urls[name+'.zip']=mirrors[0]

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    jobs={pool.submit(fetch,url,CACHE/name):name for name,url in urls.items()}
    for job in concurrent.futures.as_completed(jobs):
        name=jobs[job]
        try:
            path=job.result()
            target=CACHE/('blender' if name=='blender.zip' else 'mpfb' if name=='mpfb-source.zip' else 'assetpacks'/Path(name).stem)
            if name not in ['blender.zip','mpfb-source.zip']:target=CACHE/'assetpacks'/Path(name).stem
            target.mkdir(parents=True,exist_ok=True)
            with zipfile.ZipFile(path) as z:z.extractall(target)
            print('Extracted',name,flush=True)
        except Exception as error: print('ERROR',name,repr(error),flush=True)
print('DONE',flush=True)
