import {CHAMPIONS} from './catalog.js';

const neutral=(id,name,hp,damage,glyph)=>Object.freeze({id,name,hp,damage,glyph,element:'neutral',combatRole:'monster',traits:[],sideTrait:null,cost:0,range:1,attackTicks:20,moveTicks:5,damageType:'physical',monster:true,description:'Neutral monster. Attacks every two seconds.'});
export const MONSTERS=Object.freeze({wolf:neutral('wolf','Wolf',1000,150,'🐺'),tiger:neutral('tiger','Tiger',2000,300,'🐯'),bear:neutral('bear','Bear',4000,600,'🐻'),dragon:neutral('dragon','Dragon',8000,1200,'🐉')});
export const COMBAT_CATALOG=Object.freeze({...CHAMPIONS,...MONSTERS});
export function encounter(stage,random=Math.random){
  const index=Math.min(5,stage)-1,reward=[2,4,8,12,20][index],penalty=[1,2,4,6,10][index];
  const legends=Object.values(CHAMPIONS).filter(c=>c.legendary);
  const types=stage===1?['wolf','wolf','wolf']:stage===2?['tiger','tiger']:stage===3?['bear']:stage===4?['dragon']:[legends[Math.min(legends.length-1,Math.floor(random()*legends.length))].id];
  return {name:stage<5?['Wolf pack','Tiger den','Bear encounter','Dragon encounter'][index]:'Legendary guardian',reward,penalty,roster:types.map((type,i)=>({id:-1-i,type,stars:stage>=5?3:1,position:{x:types.length===3?[2,4,6][i]:types.length===2?[2,5][i]:3,y:5}}))};
}
