import {combatDisplayPoint} from './combat-coordinates.js';

const pointAt=(p,t)=>{
  const fraction=Math.max(0,Math.min(1,(t-p.startTick)/(p.endTick-p.startTick)));
  return {x:p.from.x+(p.to.x-p.from.x)*fraction,y:p.from.y+(p.to.y-p.from.y)*fraction};
};
// Swept point collision: find the same time and place on both moving paths.
// Merely crossing a path at different times does not collide.
function collision(a,b,low,high){
  if(low>high)return null;
  const ap=pointAt(a,low),bp=pointAt(b,low),dx=ap.x-bp.x,dy=ap.y-bp.y;
  const vx=(a.to.x-a.from.x)/(a.endTick-a.startTick)-(b.to.x-b.from.x)/(b.endTick-b.startTick);
  const vy=(a.to.y-a.from.y)/(a.endTick-a.startTick)-(b.to.y-b.from.y)/(b.endTick-b.startTick);
  const speed=vx*vx+vy*vy;
  const offset=speed?Math.max(0,Math.min(high-low,-(dx*vx+dy*vy)/speed)):0;
  if((dx+vx*offset)**2+(dy+vy*offset)**2>1e-10)return null;
  return {...pointAt(a,low+offset),tick:low+offset};
}

export class CrystalProjectileEffects{
  constructor(battle){this.battle=battle;this.flights=[];this.serial=0;this.collisions=new Set();this.checkedTick=battle.tick;this.healing=new Map();this.healed=new Set();}
  launch(beams){
    if(!beams.length||!this.battle.teamAugments[beams[0].sourceTeam]?.includes('aurora-dance'))return;
    const volley=++this.serial,startTick=this.battle.tick;
    for(const beam of beams){
      const pair=this.battle.crystal?.pairs.get(beam.ownerId);
      const bodyIds=pair?[pair.ownerId,pair.mirrorId]:[beam.ownerId,beam.sourceId];
      this.flights.push({...beam,bodyIds,volley,from:combatDisplayPoint(beam.from,this.battle.height),to:combatDisplayPoint(beam.to,this.battle.height),startTick,endTick:startTick+5});
    }
  }
  damageIntents(){
    const b=this.battle,groups=new Map(),hits=[];
    for(let i=0;i<this.flights.length;i++)for(let j=i+1;j<this.flights.length;j++){
      const a=this.flights[i],c=this.flights[j];if(a.sourceTeam!==c.sourceTeam)continue;
      // One collision per pair of volleys: A+A, A+B, B+B (not six pairings).
      const key=[Math.min(a.volley,c.volley),Math.max(a.volley,c.volley)].join(':');
      if(this.collisions.has(key))continue;
      const at=collision(a,c,Math.max(this.checkedTick,a.startTick,c.startTick),Math.min(b.tick,a.endTick,c.endTick));
      if(!at)continue;
      const strongest=a.amount>=c.amount?a:c,previous=groups.get(key);
      const bodyIds=new Set([...(previous?.bodyIds||[]),...a.bodyIds,...c.bodyIds]);
      groups.set(key,{at:previous?.at||at,source:previous&&previous.source.amount>=strongest.amount?previous.source:strongest,bodyIds});
    }
    this.checkedTick=b.tick;
    for(const [key,{at,source,bodyIds}] of groups){
      this.collisions.add(key);
      b.events.push({type:'aurora-explosion',sourceTeam:source.sourceTeam,sourceId:source.sourceId,x:at.x,y:at.y,displayCoordinates:true,radius:1,amount:source.amount,collisionId:key});
      for(const target of b.living()){
        if(target.team===source.sourceTeam||target.sweptBy||b.crystal?.isDormant(target))continue;
        const p=combatDisplayPoint(target,b.height);
        if(Math.max(Math.abs(p.x-at.x),Math.abs(p.y-at.y))<=1+1e-9)hits.push({targetId:target.id,sourceId:source.sourceId,sourceTeam:source.sourceTeam,amount:source.amount,category:'ability',kind:'aurora-damage',auroraCollisionId:key,auroraHealIds:[...bodyIds]});
      }
    }
    this.flights=this.flights.filter(p=>p.endTick>b.tick);
    return hits;
  }
  recordDamage(effect,dealt){
    if(effect.kind!=='aurora-damage'||this.healed.has(effect.auroraCollisionId))return;
    const total=dealt.hpDamage+dealt.shieldDamage;if(total<=0)return;
    const entry=this.healing.get(effect.auroraCollisionId)||{amount:0,bodyIds:effect.auroraHealIds};
    entry.amount+=total;this.healing.set(effect.auroraCollisionId,entry);
  }
  resolveHealing(){
    // Aggregate every enemy hit, then heal each participating body once per collision.
    for(const [collisionId,{amount,bodyIds}] of this.healing){
      this.healed.add(collisionId);
      for(const id of new Set(bodyIds)){
        const body=this.battle.units.find(u=>u.id===id);
        if(!body||body.hp<=0||body.eliminated)continue;
        const restored=Math.max(0,Math.min(body.maxHp-body.hp,amount));
        if(restored){body.hp+=restored;this.battle.events.push({type:'heal',id,amount:restored,kind:'aurora-dance',collisionId});}
      }
    }
    this.healing.clear();
  }
  finish(){this.flights=[];this.collisions.clear();this.healing.clear();this.healed.clear();}
}
