const pointKeys=['hip','shoulder','head','hands','feet','shoulders','elbows','wrists','hips','knees','ankles'];
export function transformPoint(point,offset=[0,0,0],rotation=0){const c=Math.cos(rotation),s=Math.sin(rotation);return [point[0]*c+point[2]*s+offset[0],point[1]+offset[1],point[2]*c-point[0]*s+offset[2]];}
export function transformBody(body,frame={}){const out={...body};for(const key of pointKeys){const value=body?.[key];if(!value)continue;out[key]=Array.isArray(value[0])?value.map(point=>transformPoint(point,frame.offset,frame.rotation)):transformPoint(value,frame.offset,frame.rotation);}return out;}
export function transformSurface(samples,frame={}){return samples.map(sample=>({...sample,position:transformPoint(sample.position,frame.offset,frame.rotation)}));}
export function inversePoint(point,frame={}){const offset=frame.offset||[0,0,0];return transformPoint(point.map((value,index)=>value-offset[index]),[0,0,0],-(frame.rotation||0));}
