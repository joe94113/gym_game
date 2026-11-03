import {createPathQueue} from './path-queue-v013.js';
/** Preserve the authored A* order and clearance rules while eliminating work
 * repeated inside one synchronous search. A new search always takes a fresh
 * obstacle snapshot; live movement queries deliberately bypass that cache. */
export function createNavigationSearch({THREE,bounds,colliders,getDynamicObstacles=()=>[]}){
 const clamp=THREE.MathUtils.clamp;
 let searches=0,liveQueries=0,dynamicReads=0,lastSearch=null;
 const dynamicSnapshot=()=>{dynamicReads++;return getDynamicObstacles()||[];};
 const outside=(x,z)=>x<bounds.minX+.65||x>bounds.maxX-.65||z<bounds.minZ+.65||z>bounds.maxZ-.65;
 const overlaps=(x,z,radius,c)=>!c.disabled&&x>c.x-c.hx-radius&&x<c.x+c.hx+radius&&z>c.z-c.hz-radius&&z<c.z+c.hz+radius;
 function blocked(x,z,radius=.34){
  liveQueries++;if(outside(x,z))return true;
  return colliders.some(c=>overlaps(x,z,radius,c))||dynamicSnapshot().some(c=>overlaps(x,z,radius,c));
 }
 function findPath(start,end){
  searches++;const obstacles=dynamicSnapshot(),work={dynamicSnapshots:1,gridQueries:0,gridCollisionChecks:0,memoHits:0,iterations:0,pathPoints:0},memo=new Map();lastSearch=work;
  const searchBlocked=(x,z,radius)=>outside(x,z)||colliders.some(c=>overlaps(x,z,radius,c))||obstacles.some(c=>overlaps(x,z,radius,c));
  if(searchBlocked(end.x,end.z,.34))return [];
  const size=.65,minX=bounds.minX+.7,minZ=bounds.minZ+.7,cols=Math.floor((bounds.maxX-minX-.7)/size)+1,rows=Math.floor((bounds.maxZ-minZ-.7)/size)+1;
  const point=(x,z)=>({x:clamp(Math.round((x-minX)/size),0,cols-1),z:clamp(Math.round((z-minZ)/size),0,rows-1)});
  const from=point(start.x,start.z),to=point(end.x,end.z),key=p=>p.z*cols+p.x;
  const worldPoint=p=>new THREE.Vector3(p.x*size+minX,.09,p.z*size+minZ);
  const gridBlocked=(k,p)=>{
   work.gridQueries++;if(memo.has(k)){work.memoHits++;return memo.get(k);}
   work.gridCollisionChecks++;const result=searchBlocked(p.x*size+minX,p.z*size+minZ,.43);memo.set(k,result);return result;
  };
  const startKey=key(from),endKey=key(to),opened=createPathQueue(),best=new Map([[startKey,0]]),previous=new Map(),closed=new Set();opened.push({...from,g:0,f:0});
  let found=null,iterations=0;
  while(opened.length&&iterations++<cols*rows){
   // The queue preserves the original stable-sort FIFO ties without sorting
   // the entire frontier again for every visited cell.
   const current=opened.shift(),currentKey=key(current);
   if(closed.has(currentKey))continue;
   if(currentKey===endKey){found=current;break;}
   closed.add(currentKey);
   for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const next={x:current.x+dx,z:current.z+dz};
    if(next.x<0||next.x>=cols||next.z<0||next.z>=rows)continue;
    const k=key(next);
    if(closed.has(k)||(k!==endKey&&gridBlocked(k,next)))continue;
    const g=current.g+1;if(best.has(k)&&best.get(k)<=g)continue;
    best.set(k,g);previous.set(k,current);opened.push({...next,g,f:g+Math.abs(next.x-to.x)+Math.abs(next.z-to.z)});
   }
  }
  work.iterations=iterations;if(!found)return [];
  const result=[end.clone().setY(.09)];let current=found;
  while(key(current)!==startKey&&result.length<cols*rows){result.push(worldPoint(current));current=previous.get(key(current));if(!current)break;}
  result.push(start.clone().setY(.09));result.reverse();work.pathPoints=result.length;return result;
 }
 return{blocked,findPath,getDiagnostics:()=>({searches,liveQueries,dynamicReads,lastSearch:lastSearch?{...lastSearch}:null})};
}
