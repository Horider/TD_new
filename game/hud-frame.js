export function visibleMapBounds(t) {
  const left=Math.max(0,t.offsetX), top=Math.max(0,t.offsetY);
  const right=Math.min(t.width,t.offsetX+1536*t.scale), bottom=Math.min(t.height,t.offsetY+1024*t.scale);
  return {left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
}
