import {teamTraits} from './catalog.js';

// Combat time, not browser time, drives every trait effect.
export class TraitEffects {
  constructor(battle){
    this.battle=battle;this.burns={};this.meteors=[];this.waves=[];this.meteorStreams=[];this.walls=[];this.thunderstorms=[];
    this.baseStats=new Map(battle.units.map(u=>[u.id,{maxHp:u.maxHp,attackDamage:u.attackDamage}]));
    this.teams=Object.fromEntries(['azure','ember'].map(team=>[team,teamTraits(battle.living(team),battle.catalog)]));
    for(const team of ['azure','ember']){
      if(this.teams[team].meteor)this.meteorStreams.push({team,nextTick:0,lastTargetId:-1,serial:0});
      if(this.teams[team].tsunami)this.waves.push({id:team,team,startTick:0,endTick:70,x:-.5,hitIds:[],resistedIds:[]});
      if(this.teams[team].windWall)this.walls.push({team,y:battle.height/2-.5,endTick:50});
      if(this.teams[team].thunder)this.thunderstorms.push({team,impactTick:50,triggered:false,targets:[]});
      for(const u of battle.living(team)){
        const element=battle.catalog[u.type].element,traits=this.teams[team];
        if(element==='mountain'){u.shield=u.maxHp*traits.shieldPercent;u.maxShield=u.shield;u.goldenUntil=traits.goldenShield?50:0;}
        if(element==='electric')u.attackDamage+=u.attackDamage*traits.electricPercent;
        if(element==='air'&&traits.windWall){u.maxHp*=1.5;u.hp*=1.5;u.attackDamage*=1.5;u.airBoosted=true;}
      }
    }
    this.launchMeteors();
  }
  isGolden(unit){return this.battle.phase==='combat'&&this.battle.tick<unit.goldenUntil;}
  wallActive(wall){return this.battle.phase==='combat'&&this.battle.tick<wall.endTick;}
  canTarget(attacker,target){
    return !(attacker.team!==target.team&&this.battle.catalog[target.type].element==='air'&&this.walls.some(w=>w.team===target.team&&this.wallActive(w)));
  }
  canStep(unit,from,to){
    return !this.walls.some(w=>w.team!==unit.team&&this.wallActive(w)&&(from.y<w.y)!==(to.y<w.y));
  }
  applyStun(unit,durationTicks){
    if(unit.hp<=0||this.isGolden(unit))return false;
    unit.stunnedUntil=Math.max(unit.stunnedUntil||0,this.battle.tick+durationTicks);return true;
  }
  finish(){
    for(const u of this.battle.units){
      const base=this.baseStats.get(u.id);u.maxHp=base.maxHp;u.attackDamage=base.attackDamage;u.hp=Math.min(u.hp,u.maxHp);
      u.shield=0;u.maxShield=0;u.goldenUntil=0;u.stunnedUntil=0;u.airBoosted=false;
    }
    this.burns={};
  }
  launchMeteors(){
    const {battle}=this;
    this.meteors=this.meteors.filter(m=>!m.impacted||battle.tick<=m.impactTick+5);
    for(const stream of this.meteorStreams){
      while(battle.tick>=stream.nextTick){
        const enemies=battle.living().filter(u=>u.team!==stream.team&&!u.sweptBy).sort((a,b)=>a.id-b.id);
        const target=enemies.find(u=>u.id>stream.lastTargetId)||enemies[0];
        if(target){
          const launchTick=stream.nextTick;stream.lastTargetId=target.id;
          this.meteors.push({id:`${stream.team}-${stream.serial++}`,team:stream.team,targetId:target.id,x:target.x,y:target.y,launchTick,impactTick:launchTick+30,impacted:false});
        }
        stream.nextTick+=5;
      }
    }
  }
  onAttack(attacker,target){
    const stats=this.battle.catalog[attacker.type],team=this.teams[attacker.team];
    if(stats.element==='fire'&&team.burnPercent&&!this.isGolden(target)){
      const old=this.burns[target.id];
      this.burns[target.id]={rate:Math.max(old?.rate||0,team.burnPercent),sourceId:attacker.id,expires:this.battle.tick+30,nextTick:old?.nextTick||this.battle.tick+10};
    }
    if(stats.element==='air'&&team.coinChance&&this.battle.random()<team.coinChance){
      this.battle.goldEarned[attacker.team]++;this.battle.onGold?.(attacker.team,1);
      this.battle.events.push({type:'gold',id:attacker.id,team:attacker.team,amount:1});
    }
    return stats.element==='water'?attacker.maxHp*team.healPercent:0;
  }
  sweep(){
    const {battle}=this;
    for(const wave of this.waves){
      if(battle.tick>wave.endTick)continue;
      wave.x=-.5+battle.width*Math.min(1,(battle.tick-wave.startTick)/(wave.endTick-wave.startTick));
      for(const unit of battle.living().filter(u=>u.team!==wave.team)){
        if(!unit.sweptBy&&!wave.resistedIds.includes(unit.id)&&unit.x<=wave.x){
          // Immunity resolves this wave's contact, even after the front has passed.
          if(this.isGolden(unit)){wave.resistedIds.push(unit.id);continue;}
          unit.sweptBy=wave.id;unit.targetId=null;wave.hitIds.push(unit.id);
          battle.events.push({type:'swept',id:unit.id});
        }
        if(unit.sweptBy===wave.id){
          // Swept units leave grid occupancy immediately and cannot attack.
          unit.sweepX=wave.x+.5;
          if(battle.tick===wave.endTick){unit.hp=0;unit.eliminatedBy='tsunami';battle.events.push({type:'ejected',id:unit.id});}
        }
      }
    }
  }
  damageIntents(){
    const {battle}=this,hits=[];
    this.launchMeteors();
    for(const storm of this.thunderstorms){
      if(storm.triggered||battle.tick<storm.impactTick)continue;
      storm.triggered=true;
      for(const u of battle.living().filter(u=>u.team!==storm.team)){
        const execute=u.hp<u.maxHp*.5;
        hits.push({targetId:u.id,amount:execute?u.hp:u.maxHp*.5,execute,sourceId:null,kind:'thunder'});
        storm.targets.push({id:u.id,x:u.sweepX??u.x,y:u.y});
      }
    }
    for(const meteor of this.meteors){
      const target=battle.units.find(u=>u.id===meteor.targetId);
      if(target?.hp>0&&!target.sweptBy){meteor.x=target.x;meteor.y=target.y;}
      if(meteor.impacted||battle.tick<meteor.impactTick)continue;
      meteor.impacted=true;
      const victims=battle.living().filter(u=>u.team!==meteor.team&&!u.sweptBy&&Math.abs(u.x-meteor.x)+Math.abs(u.y-meteor.y)<=1)
        .sort((a,b)=>(a.id===meteor.targetId?-1:b.id===meteor.targetId?1:a.id-b.id)).slice(0,2);
      for(const u of victims)hits.push({targetId:u.id,amount:u.maxHp*.25,sourceId:null,kind:'meteor'});
      battle.events.push({type:'meteor-impact',id:meteor.id,x:meteor.x,y:meteor.y,victimIds:victims.map(u=>u.id)});
    }
    for(const [id,burn] of Object.entries(this.burns)){
      const unit=battle.units.find(u=>u.id===Number(id));
      if(!unit||unit.hp<=0||this.isGolden(unit)||battle.tick>burn.expires){delete this.burns[id];continue;}
      if(battle.tick>=burn.nextTick){
        hits.push({targetId:unit.id,amount:unit.maxHp*burn.rate,sourceId:burn.sourceId,kind:'burn'});
        burn.nextTick+=10;
      }
    }
    return hits;
  }
}
