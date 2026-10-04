import {championStats,CHAMPIONS} from './catalog.js';
import {TRAIT_DETAILS,traitTier,isMaxTrait} from './trait-ui.js';

// Wall-clock presentation delay: combat speed never shortens the finish animation.
export class ResultReveal {
  constructor(delay=1500){this.delay=delay;this.result=null;this.deadline=Infinity;}
  sync(result,now){
    if(this.result===result)return;
    this.result=result;this.deadline=result?now+this.delay:Infinity;
  }
  ready(now){return !!this.result&&now>=this.deadline;}
  pending(now){return !!this.result&&!this.ready(now);}
}

// Scout the actual deployed roster, including combat buffs and removal status.
export function scoutOpponent(roster,traits,units=[],catalog=CHAMPIONS){
  const champions=roster.filter(u=>u.position.bench===undefined&&!u.overflow).map(u=>{
    const stats=championStats(u.type,u.stars||1,catalog),live=units.find(v=>v.id===u.id);
    return {id:u.id,type:u.type,portrait:stats.portrait,name:stats.name,element:stats.element,role:stats.combatRole,cost:stats.cost,stars:u.stars||1,
      x:live?.x??u.position.x,y:live?.y??u.position.y,hp:live?.hp??stats.hp,maxHp:live?.maxHp??stats.hp,
      attack:live?.attackDamage??stats.damage,seconds:(live?.effectiveAttackTicks??stats.attackTicks/(1+(live?.attackSpeedBonus||0)))/10,
      range:live?.effectiveRange??stats.range,
      status:live?.eliminated?'OUT':live?.hp===0?'Defeated':live?.sweptBy?'Swept':'On board'};
  }).sort((a,b)=>b.y-a.y||a.x-b.x);
  const allTraits=Object.entries(TRAIT_DETAILS).filter(([e])=>traits.counts[e]>0).map(([element,detail])=>{
    const count=traits.counts[element],tier=traitTier(element,count);
    return {element,name:detail.name,category:detail.category||'element',count,tier,max:isMaxTrait(element,count),next:detail.steps.find(n=>n>count)};
  }).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const threat=champions.filter(c=>c.status!=='OUT'&&c.status!=='Defeated').sort((a,b)=>b.attack/b.seconds-a.attack/a.seconds)[0];
  return {champions,elements:allTraits.filter(t=>t.category==='element'),classes:allTraits.filter(t=>t.category==='class'),threat,upgraded:champions.filter(c=>c.stars>1).length,
    frontline:champions.filter(c=>c.range===1).length,ranged:champions.filter(c=>c.range>1).length};
}
