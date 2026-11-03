// Verbatim navigation functions from the sealed v0.11 controller.
// SHA-256 of original complete controller: f4d6342361496c01247c6fe1ebf1d2f5c200c9b6a99c7816085c9bce76a9a90a
export function createLegacyNavigationV012({THREE,bounds,colliders,getDynamicObstacles=()=>[]}){
 const clamp=THREE.MathUtils.clamp,exerciseRig={getNavigationObstacles:getDynamicObstacles};
  function blocked(x, z, radius = 0.34) {
    if(x<bounds.minX+.65||x>bounds.maxX-.65||z<bounds.minZ+.65||z>bounds.maxZ-.65)return true;
    const overlaps=c=>!c.disabled&&x>c.x-c.hx-radius&&x<c.x+c.hx+radius&&z>c.z-c.hz-radius&&z<c.z+c.hz+radius;
    return colliders.some(overlaps)||(exerciseRig.getNavigationObstacles?.()||[]).some(overlaps);
  }
  function findPath(start, end) {
    if(blocked(end.x,end.z))return [];
    const size=.65,minX=bounds.minX+.7,minZ=bounds.minZ+.7,cols=Math.floor((bounds.maxX-minX-.7)/size)+1,rows=Math.floor((bounds.maxZ-minZ-.7)/size)+1;
    const point=(x,z)=>({x:clamp(Math.round((x-minX)/size),0,cols-1),z:clamp(Math.round((z-minZ)/size),0,rows-1)});
    const from = point(start.x, start.z), to = point(end.x, end.z);
    const key = p => p.z * cols + p.x;
    const worldPoint=p=>new THREE.Vector3(p.x*size+minX,.09,p.z*size+minZ);
    const startKey = key(from), endKey = key(to), opened = [{ ...from, g: 0, f: 0 }], best = new Map([[startKey, 0]]), previous = new Map(), closed = new Set();
    let found = null, iterations = 0;
    while (opened.length && iterations++ < cols*rows) {
      opened.sort((a, b) => a.f - b.f);
      const current = opened.shift(), currentKey = key(current);
      if (closed.has(currentKey)) continue;
      if (currentKey === endKey) { found = current; break; }
      closed.add(currentKey);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { x: current.x + dx, z: current.z + dz };
        if (next.x < 0 || next.x >= cols || next.z < 0 || next.z >= rows) continue;
        const k = key(next), wp = worldPoint(next);
        if (closed.has(k) || (k !== endKey && blocked(wp.x, wp.z, 0.43))) continue;
        const g = current.g + 1;
        if (best.has(k) && best.get(k) <= g) continue;
        best.set(k, g); previous.set(k, current); opened.push({ ...next, g, f: g + Math.abs(next.x - to.x) + Math.abs(next.z - to.z) });
      }
    }
    if (!found) return [];
    const result = [end.clone().setY(0.09)];
    let current = found;
    while (key(current) !== startKey && result.length < cols*rows) { result.push(worldPoint(current)); current = previous.get(key(current)); if (!current) break; }
    result.push(start.clone().setY(0.09)); result.reverse();
    return result;
  }

 return{blocked,findPath};
}
