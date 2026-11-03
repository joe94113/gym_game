import json, sys
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
folder=Path('artifacts/dumbbell-fingers-v013')
label=sys.argv[1] if len(sys.argv)>1 else 'baseline'
d=json.loads((folder/f'plot-{label}.json').read_text())
fig,axs=plt.subplots(1,5,figsize=(18,5),sharex=True,sharey=True)
for ax,f in zip(axs,['index','middle','ring','pinky','thumb']):
 for p in d['points']:
  if not p['bone'].startswith(f+'_'): continue
  ax.scatter(p['point'][1]*1000,p['point'][2]*1000,s=5,color={'01':'#2980b9','02':'#e67e22','03':'#e74c3c'}[p['bone'].split('_')[1]],alpha=.45)
 for i in [16,23]:ax.add_patch(Circle((0,0),i,fill=False,linestyle='-' if i==16 else '--',color='black'))
 joints=d['joints'][f];ax.plot([p[1]*1000 for p in joints],[p[2]*1000 for p in joints],'ko-');ax.set_title(f+' '+str(d['profile'][f]));ax.set_aspect('equal');ax.set_xlim(-75,80);ax.set_ylim(-80,80);ax.grid();ax.set_xlabel('advance mm')
axs[0].set_ylabel('normal mm');fig.suptitle(label+str(d['offset']));fig.tight_layout();fig.savefig(folder/f'plot-{label}.png',dpi=120)
