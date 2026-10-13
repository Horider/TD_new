export const CONSTRUCTION_SEQUENCE = ['01','extra-01','extra-v2-01','02','extra-02','extra-v2-02','03','extra-03','extra-v2-03','04','05','extra-v2-04','extra-04','extra-v2-05','06'];
export const CONSTRUCTION_FRAMES = [70,35,35,85,42,43,85,42,43,190,45,45,45,45,250];
export const CONSTRUCTION_DURATION = 1.1;
export const CONSTRUCTION_IMAGES = CONSTRUCTION_SEQUENCE.map(frame => `assets/effects/construction/construction-${frame}.png`);
export function constructionFrame(age) {
  const sourceAge = age * CONSTRUCTION_FRAMES.reduce((sum, duration) => sum + duration, 0) / (CONSTRUCTION_DURATION * 1000);
  let end = 0;
  for (let index = 0; index < CONSTRUCTION_FRAMES.length; index++) {
    end += CONSTRUCTION_FRAMES[index] / 1000;
    if (sourceAge < end) return index;
  }
  return CONSTRUCTION_FRAMES.length - 1;
}

export function constructionReveal(age) {
  const progress = Math.max(0, Math.min(1, (age / CONSTRUCTION_DURATION - .25) / .55));
  return progress * progress * (3 - 2 * progress);
}

