/** Background animation may sleep only beyond the protected near area.
 * Render visibility and physics/ownership are left to their existing owners. */
export function createNpcAnimationView(THREE){const matrix=new THREE.Matrix4(),frustum=new THREE.Frustum(),sphere=new THREE.Sphere(),point=new THREE.Vector3();let context={},ready=false;const distance=(a,b)=>{if(!b)return Infinity;const x=Array.isArray(b)?b[0]:b.x,z=Array.isArray(b)?b[2]:b.z;return Number.isFinite(x)&&Number.isFinite(z)?Math.hypot(a.x-x,a.z-z):Infinity;};return{
 setContext(next={}){context=next;const camera=next.camera;ready=!!camera?.isCamera;if(ready){camera.updateMatrixWorld();matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix,camera.coordinateSystem);}},
 defer({position,center,forced=false}){if(!ready||forced||context.quality==='clear')return false;if(Math.min(distance(position,context.playerPosition),distance(position,context.cameraPosition))<10)return false;point.copy(center);sphere.set(point,2.1);return!frustum.intersectsSphere(sphere);},
};}
