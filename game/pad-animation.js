export const PAD_IMAGES = Array.from({length:6},(_,index)=>`assets/ui/build-pad/pad-${String(index+1).padStart(2,'0')}.png`);
export const PAD_DURATION = .9;
export const PAD_WIDTH = 144;
export const PAD_HEIGHT = 132;
export const padFrame = age => Math.max(0,Math.min(5,Math.floor(age/(PAD_DURATION/6))));
