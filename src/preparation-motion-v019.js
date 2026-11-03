const clamp=x=>Math.max(0,Math.min(1,x));

/** Keep the existing swing height and contact locations, with zero vertical
 * velocity when the sole leaves or returns to its planted position. */
export function preparationFootLift(phase){const p=clamp(phase),s=p*p*p*(10+p*(-15+6*p));return Math.sin(Math.PI*s);}
