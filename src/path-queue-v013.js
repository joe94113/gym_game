/** Stable minimum queue: equal priorities retain original insertion order. */
export function createPathQueue(){
 const heap=[];let sequence=0;
 const less=(a,b)=>a.value.f<b.value.f||(a.value.f===b.value.f&&a.sequence<b.sequence);
 return{
  get length(){return heap.length;},
  push(value){let i=heap.length;const item={value,sequence:sequence++};heap.push(item);while(i>0){const p=(i-1)>>1;if(!less(item,heap[p]))break;heap[i]=heap[p];i=p;}heap[i]=item;},
  shift(){if(!heap.length)return undefined;const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&less(heap[child+1],heap[child]))child++;if(!less(heap[child],last))break;heap[i]=heap[child];i=child;}heap[i]=last;}return first.value;},
 };
}
