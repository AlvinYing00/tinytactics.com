import {ELEMENTS} from './catalog.js';

export const SAND_CHAMPION='sand-5';
export const SAND_MISSION_NAME='Master of Origins';
export const SAND_MISSION_ORIGINS=5;

// The page owns this object. Reuse it for a new match; a browser refresh creates
// a fresh object, deliberately without localStorage or account persistence.
export const createSandProgress=()=>({sandUnlocked:false,sandGuaranteePending:false});

export function completeSandMission(progress,origins){
  // Callers pass activated Origins captured at combat start. Higher breakpoints
  // and repeated identities still contribute only one mission point per Origin.
  const distinct=new Set(origins.filter(origin=>ELEMENTS.includes(origin)));
  if(progress.sandUnlocked||distinct.size<SAND_MISSION_ORIGINS)return false;
  progress.sandUnlocked=true;progress.sandGuaranteePending=true;return true;
}

export const unlockedMissionChampions=progress=>new Set(progress.sandUnlocked?[SAND_CHAMPION]:[]);
