import { CONSTRUCTION_SEQUENCE, CONSTRUCTION_DURATION, constructionFrame, constructionReveal } from './construction.js?v=20261014-landscape-1';

// Both fifteen-frame effects share their rhythm and base anchor.
export const UPGRADE_DURATION = 1.9;
export const UPGRADE_IMAGES = CONSTRUCTION_SEQUENCE.map(frame => `assets/effects/upgrade/upgrade-${frame}.png`);
export const upgradeFrame = age => constructionFrame(age * CONSTRUCTION_DURATION / UPGRADE_DURATION);
export const upgradeReveal = age => constructionReveal(age * CONSTRUCTION_DURATION / UPGRADE_DURATION);
