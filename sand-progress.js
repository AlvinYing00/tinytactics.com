import {CHAMPIONS,ELEMENTS} from './catalog.js';

export const SAND_CHAMPION='sand-5';
export const SAND_MISSION_NAME='Master of Origins';
export const SAND_MISSION_ORIGINS=5;

// The page owns this object. Reuse it for a new match; a browser refresh creates
// a fresh object, deliberately without localStorage or account persistence.
export const createSandProgress=()=>({sandUnlocked:false,sandGuaranteePending:false});

export function deployedOrigins(units,catalog=CHAMPIONS){
  const mainOrigins=new Set(ELEMENTS);
  return [...new Set(units.filter(u=>!u.summoned&&!u.crystalMirror&&!u.overflow&&u.position?.bench===undefined)
    .map(u=>catalog[u.type]?.element).filter(origin=>mainOrigins.has(origin)))];
}

export function completeSandMission(progress,origins){
  if(progress.sandUnlocked||new Set(origins).size<SAND_MISSION_ORIGINS)return false;
  progress.sandUnlocked=true;progress.sandGuaranteePending=true;return true;
}

export const unlockedMissionChampions=progress=>new Set(progress.sandUnlocked?[SAND_CHAMPION]:[]);
