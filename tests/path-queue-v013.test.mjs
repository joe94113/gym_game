import test from 'node:test';
import assert from 'node:assert/strict';
import {createPathQueue} from '../src/path-queue-v013.js';
test('navigation heap retains exact stable-array ordering through mixed insertions',()=>{
 const heap=createPathQueue(),array=[];let state=5381;
 for(let i=0;i<5000;i++){
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  if(state%4||!array.length){const item={f:state%19,id:i};array.push(item);heap.push(item);}
  else{array.sort((a,b)=>a.f-b.f);assert.equal(heap.shift(),array.shift());}
  assert.equal(heap.length,array.length);
 }
 array.sort((a,b)=>a.f-b.f);for(const item of array)assert.equal(heap.shift(),item);assert.equal(heap.shift(),undefined);
});
