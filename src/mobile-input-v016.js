const finite=value=>typeof value==='number'&&Number.isFinite(value);

/** Client coordinates -> a bounded analog direction. Forward is positive y. */
export function joystickVector(dx,dy,{radius=44,deadzone=.16}={}){
  if(!finite(dx)||!finite(dy)||!finite(radius)||radius<=0||!finite(deadzone)||deadzone<0||deadzone>=1)return{x:0,y:0};
  const distance=Math.hypot(dx,dy),amount=Math.min(1,distance/radius);
  if(amount<=deadzone||distance===0)return{x:0,y:0};
  const speed=(amount-deadzone)/(1-deadzone);
  return{x:dx/distance*speed,y:-dy/distance*speed};
}

/** Pointer ownership keeps a second finger from ending somebody else's hold. */
export function createTouchMovementState({onChange=()=>{},deadzone=.16}={}){
  let enabled=false,pointerId=null,runPointerId=null,originX=0,originY=0,radius=44,dx=0,dy=0,vector={x:0,y:0};
  const snapshot=()=>({enabled,pointerId,runPointerId,x:vector.x,y:vector.y,running:runPointerId!==null,dx,dy,radius});
  const emit=()=>onChange({x:vector.x,y:vector.y,running:runPointerId!==null});
  const reset=()=>{pointerId=null;runPointerId=null;dx=0;dy=0;vector={x:0,y:0};emit();};
  return{
    setEnabled(value){const next=!!value;if(next===enabled)return false;enabled=next;reset();return true;},
    begin(id,x,y,nextRadius=44){if(!enabled||id===null||id===undefined||pointerId!==null||!finite(x)||!finite(y)||!finite(nextRadius)||nextRadius<=0)return false;pointerId=id;originX=x;originY=y;radius=nextRadius;dx=0;dy=0;vector={x:0,y:0};emit();return true;},
    move(id,x,y){if(!enabled||pointerId!==id||!finite(x)||!finite(y))return false;dx=x-originX;dy=y-originY;vector=joystickVector(dx,dy,{radius,deadzone});emit();return true;},
    end(id){if(pointerId!==id||id===null)return false;pointerId=null;dx=0;dy=0;vector={x:0,y:0};emit();return true;},
    beginRun(id){if(!enabled||id===null||id===undefined||runPointerId!==null)return false;runPointerId=id;emit();return true;},
    endRun(id){if(runPointerId!==id||id===null)return false;runPointerId=null;emit();return true;},
    reset,
    getState:snapshot,
  };
}
