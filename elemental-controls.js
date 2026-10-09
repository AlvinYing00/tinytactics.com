// Shared combat statuses and per-target counters. All deadlines use battle ticks.
export class ElementalControls {
  constructor(battle){
    this.battle=battle;this.storms=[];this.pending=[];this.started=false;this.finished=false;
    for(const u of battle.units){
      u.frozenUntil=0;u.fearedUntil=0;u.chilledUntil=0;u.chillActive=false;
      u.lightStacks=0;u.iceStacks=0;u.lightCooldownUntil=0;u.iceCooldownUntil=0;
      u.darkFearCount=0;u.darkFearReady=0;
    }
  }
  active(){return this.battle.phase==='combat'&&!this.finished;}
  element(unit){return this.battle.catalog[unit.type]?.element;}
  frozen(unit){return this.active()&&this.battle.tick<(unit.frozenUntil||0);}
  feared(unit){return this.active()&&this.battle.tick<(unit.fearedUntil||0);}
  chilled(unit){return this.active()&&this.battle.tick<(unit.chilledUntil||0);}
  immobile(unit){return this.active()&&(unit.cosmicHeld||this.battle.tick<(unit.stunnedUntil||0)||this.frozen(unit));}
  cannotAttack(unit){return this.immobile(unit)||this.feared(unit);}
  protected(unit){return this.battle.traits.isGolden(unit)||!!this.battle.augments?.controlImmune(unit);}
  apply(unit,kind,duration,emit=true){
    if(!this.active()||unit.hp<=0||unit.eliminated||unit.sweptBy||this.protected(unit))return false;
    if(this.element(unit)==='light'&&['stun','fear'].includes(kind)&&this.battle.augments?.has(unit.team,'divine-squad'))return false;
    const resist=this.element(unit)==='light'&&['stun','fear'].includes(kind)?this.battle.traits.teams[unit.team].lightControlResist||0:0;
    if(resist&&this.battle.random()<resist){this.battle.events.push({type:'control-resist',id:unit.id,kind});return false;}
    const fields={stun:'stunnedUntil',fear:'fearedUntil',freeze:'frozenUntil',chill:'chilledUntil'},field=fields[kind];
    if(!field)throw new Error('Unknown control effect.');
    if(kind==='chill'&&!this.chilled(unit)){
      // Slow outstanding cooldowns once; refreshing never compounds the slow.
      unit.attackReady=this.battle.tick+Math.max(0,unit.attackReady-this.battle.tick)*2;
      unit.moveReady=this.battle.tick+Math.max(0,unit.moveReady-this.battle.tick)/.75;
      unit.chillActive=true;
    }
    unit[field]=Math.max(unit[field]||0,this.battle.tick+duration);
    if(kind!=='chill')unit.targetId=null;
    if(emit)this.battle.events.push({type:kind,id:unit.id,duration});return true;
  }
  start(){
    if(this.started)return;this.started=true;
    // Both teams already have Golden Shield and Augment protection installed.
    for(const team of ['azure','ember']){
      if(!this.battle.traits.teams[team].iceStorm)continue;
      this.storms.push({team,startTick:0,endTick:30});
      for(const target of this.battle.living().filter(u=>u.team!==team)){
        target.iceStacks=0;target.iceCooldownUntil=60;
        if(this.apply(target,'freeze',30))this.pending.push({source:null,sourceTeam:team,target,amount:target.maxHp*.55,kind:'freeze',storm:true});
      }
    }
  }
  update(){
    if(!this.active())return;
    for(const u of this.battle.units)if(u.chillActive&&!this.chilled(u)){
      u.attackReady=this.battle.tick+Math.max(0,u.attackReady-this.battle.tick)*.5;
      u.moveReady=this.battle.tick+Math.max(0,u.moveReady-this.battle.tick)*.75;
      u.chillActive=false;
    }
  }
  damageIntents(){const hits=this.pending;this.pending=[];return hits;}
  afterBasic(hit,dealt){
    const {attacker,target}=hit,b=this.battle,team=b.traits.teams[attacker.team],hits=[];
    const landed=(dealt?.hpDamage||0)+(dealt?.shieldDamage||0);
    if(!this.active()||hit.dodged||hit.repelled||landed<=0||target.eliminated||target.sweptBy)return hits;
    switch(this.element(attacker)){
      case 'light':
        if(target.hp<=0)break;
        if(team.lightStacksRequired&&b.tick>=target.lightCooldownUntil){
          target.lightStacks+=team.lightStacksPerHit;
          b.events.push({type:'light-stack',id:target.id,stacks:target.lightStacks});
          if(target.lightStacks>=team.lightStacksRequired){
            target.lightStacks=0;target.lightCooldownUntil=b.tick+60;
            this.apply(target,'stun',team.lightStunTicks);
          }
        }
        break;
      case 'dark':
        if(team.darkFearEvery&&b.tick>=attacker.darkFearReady){
          attacker.darkFearCount++;
          if(attacker.darkFearCount>=team.darkFearEvery){
            attacker.darkFearCount=0;attacker.darkFearReady=b.tick+60;
            this.apply(target,'fear',team.darkFearTicks);
          }
        }
        break;
      case 'ice':
        if(!team.iceChillTicks||target.hp<=0)break;
        this.apply(target,'chill',team.iceChillTicks);
        if(b.tick>=target.iceCooldownUntil){
          target.iceStacks++;b.events.push({type:'ice-stack',id:target.id,stacks:target.iceStacks});
          if(target.iceStacks>=6){
            target.iceStacks=0;target.iceCooldownUntil=b.tick+60;
            if(this.apply(target,'freeze',team.iceFreezeTicks))hits.push({source:attacker,target,amount:target.maxHp*team.iceFreezePercent,kind:'freeze'});
          }
        }
        break;
    }
    return hits;
  }
  onDeath(unit){
    if(!this.active()||unit.hp>0||unit.eliminated||this.element(unit)!=='dark')return [];
    const rule=this.battle.traits.teams[unit.team];if(!rule.darkExplosionPercent)return [];
    const suicide=this.battle.augments?.has(unit.team,'suicide-squad');
    this.battle.events.push({type:'dark-death-burst',sourceId:unit.id,x:unit.sweepX??unit.x,y:unit.y,radius:suicide?2:1});
    const targets=this.battle.living().filter(u=>u.team!==unit.team&&Math.max(Math.abs((u.sweepX??u.x)-(unit.sweepX??unit.x)),Math.abs(u.y-unit.y))<=(suicide?2:1));
    return targets.map(target=>{
      this.apply(target,'fear',rule.darkDeathFearTicks);
      return {source:unit,target,amount:(suicide?unit.maxHp*.5:unit.attackDamage*rule.darkExplosionPercent)*(this.element(target)==='light'?2:1),kind:'dark-explosion'};
    });
  }
  finish(){
    this.finished=true;this.pending=[];
    for(const u of this.battle.units)for(const key of ['frozenUntil','fearedUntil','chilledUntil','chillActive','lightStacks','iceStacks','lightCooldownUntil','iceCooldownUntil','darkFearCount','darkFearReady'])delete u[key];
  }
}
