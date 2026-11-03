import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashMobileHarness} from './mobile-performance-common-v016.mjs';
export function hashMocapHarness(){return{...hashMobileHarness(),...Object.fromEntries(['scripts/benchmark-mocap-v018.mjs','scripts/compare-mocap-v018.mjs','scripts/mocap-performance-common-v018.mjs'].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]))};}
