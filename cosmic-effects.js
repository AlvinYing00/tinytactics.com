// Vortex removal is elimination, never a death proc.
export class CosmicEffects{
  constructor(battle){
    this.battle=battle;this.asteroids=[];this.vortices=[];this.finished=false;
    for(const team of ['azure','ember']){
      const t=battle.traits.teams[team];
      if(t.cosmicAsteroid)this.asteroids.push({team,startTick:0,impactTick:50,impacted:false});
      if(t.cosmicVortex)this.vortices.push({team,startTick:0,endTick:50,exploded:false});
    }
    this.capture();
  }
  capture(){
    if(!this.vortices.some(v=>!v.exploded))return;
    for(const u of this.battle.living())if(this.battle.catalog[u.type].element!=='cosmic'&&!u.sweptBy){
      if(!u.cosmicHeld)u.cosmicOrigin={x:u.x,y:u.y};
      u.cosmicHeld=true;u.targetId=null;
    }
  }
  update(){
    if(this.finished)return;
    const b=this.battle;this.capture();
    const due=this.vortices.filter(v=>!v.exploded&&b.tick>=v.endTick);
    if(!due.length)return;
    const victims=b.living().filter(u=>b.catalog[u.type].element!=='cosmic');
    for(const u of victims){
      u.eliminated=true;u.eliminatedBy='cosmic';u.targetId=null;
      delete u.sweptBy;delete u.sweepX;delete b.traits.burns[u.id];
      b.events.push({type:'cosmic-out',id:u.id});
    }
    for(const vortex of due){
      vortex.exploded=true;b.events.push({type:'cosmic-explosion',team:vortex.team});
      const augments=b.teamAugments[vortex.team]||[];
      const types=['cosmic-5',...(augments.includes('dragon-orb')?['cosmic-6']:[]),...(augments.includes('universe-orb')?['cosmic-7']:[])];
      for(const victim of victims){
        if(b.random()<.75){
          const amount=3+Math.min(4,Math.floor(b.random()*5));
          b.goldEarned[vortex.team]+=amount;b.onGold?.(vortex.team,amount);
          b.events.push({type:'cosmic-loot',team:vortex.team,id:victim.id,amount});
        }else{
          const type=types[Math.min(types.length-1,Math.floor(b.random()*types.length))];
          b.championRewards[vortex.team].push(type);b.onChampionReward?.(vortex.team,type);
          b.events.push({type:'cosmic-loot',team:vortex.team,id:victim.id,champion:type});
        }
      }
    }
  }
  damageIntents(){
    const b=this.battle,hits=[];
    for(const rock of this.asteroids){
      if(rock.impacted||b.tick<rock.impactTick)continue;
      rock.impacted=true;b.events.push({type:'asteroid-impact',team:rock.team});
      for(const u of b.living().filter(u=>u.team!==rock.team)){
        b.controls.apply(u,'stun',30);
        hits.push({targetId:u.id,sourceTeam:rock.team,amount:u.maxHp*.25,kind:'asteroid'});
      }
    }
    return hits;
  }
  finish(){this.finished=true;for(const u of this.battle.units){delete u.cosmicHeld;delete u.cosmicOrigin;}}
}
