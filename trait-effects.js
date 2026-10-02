import {teamTraits} from './catalog.js';

// Combat time, not browser time, drives every trait effect (10 ticks = 1 second).
export class TraitEffects {
  constructor(battle){
    this.battle=battle;this.burns={};this.meteors=[];this.waves=[];this.walls=[];this.thunderstorms=[];this.inheritedDeaths=new Set();
    this.baseStats=new Map(battle.units.map(u=>[u.id,{maxHp:u.maxHp,attackDamage:u.attackDamage}]));
    this.teams=Object.fromEntries(['azure','ember'].map(team=>[team,teamTraits(battle.living(team),battle.catalog,battle.traitCounts[team])]));
    for(const team of ['azure','ember']){
      const traits=this.teams[team];
      if(traits.meteor)battle.living().filter(u=>u.team!==team).forEach((u,i)=>{
        const launchTick=i*5;
        this.meteors.push({id:`${team}-${i}`,team,targetId:u.id,x:u.x,y:u.y,launchTick,impactTick:launchTick+30,impacted:false});
      });
      if(traits.tsunami)this.waves.push({id:team,team,startTick:0,endTick:70,x:-.5,hitIds:[],resistedIds:[],completed:false});
      if(traits.windWall)this.walls.push({team,y:battle.height/2-.5,endTick:50});
      if(traits.thunder)this.thunderstorms.push({team,impactTick:30,triggered:false,targets:[]});
      for(const u of battle.living(team)){
        u.basicAttacks=0;
        if(battle.catalog[u.type].element==='mountain'){
          u.shield=u.maxHp*traits.shieldPercent;u.maxShield=u.shield;u.goldenUntil=traits.goldenShield?50:0;
        }
      }
    }
  }
  isGolden(unit){return this.battle.phase==='combat'&&this.battle.tick<unit.goldenUntil;}
  wallActive(wall){return this.battle.phase==='combat'&&this.battle.tick<wall.endTick;}
  canTarget(attacker,target,from=attacker){
    if(this.battle.catalog[attacker.type].element==='air'&&this.teams[attacker.team].windWall)return true;
    return !(attacker.team!==target.team&&this.battle.catalog[target.type].element==='air'&&this.walls.some(w=>w.team===target.team&&this.wallActive(w)&&(from.y<w.y)!==(target.y<w.y)));
  }
  canStep(unit,from,to){
    return !this.walls.some(w=>this.wallActive(w)&&(from.y<w.y)!==(to.y<w.y));
  }
  applyStun(unit,durationTicks){
    if(unit.hp<=0||unit.eliminated||this.isGolden(unit)||this.battle.augments?.controlImmune(unit))return false;
    unit.stunnedUntil=Math.max(unit.stunnedUntil||0,this.battle.tick+durationTicks);return true;
  }
  prepareAttack(attacker,target){
    attacker.basicAttacks++;
    const attackingAir=this.battle.catalog[attacker.type].element==='air',defendingAir=this.battle.catalog[target.type].element==='air';
    const every=attackingAir?this.teams[attacker.team].criticalEvery:0;
    const critical=!!every&&attacker.basicAttacks%every===0;
    const airDodge=defendingAir?this.teams[target.team].dodgeChance:0,assassinDodge=this.battle.classes?.dodge(target)||0;
    const dodge=airDodge&&assassinDodge?1-(1-airDodge)*(1-assassinDodge):airDodge||assassinDodge;
    const dodged=!!dodge&&this.battle.random()<dodge;
    this.battle.classes?.completedAttack(attacker);
    const criticalMultiplier=critical?this.teams[attacker.team].criticalMultiplier:1;
    const hit={attacker,target,critical,criticalMultiplier,dodged,amount:dodged?0:attacker.attackDamage*(this.battle.classes?.basicMultiplier(attacker,target)||1)*criticalMultiplier};
    return this.battle.augments?.prepareAttack(hit)||hit;
  }
  onAttack(attacker,target,dodged=false){
    const stats=this.battle.catalog[attacker.type],team=this.teams[attacker.team];
    if(stats.element==='fire'&&team.burnPercent&&!dodged&&!this.isGolden(target)){
      const old=this.burns[target.id];
      this.burns[target.id]={rate:Math.max(old?.rate||0,team.burnPercent),sourceId:attacker.id,expires:this.battle.tick+30,nextTick:old?.nextTick||this.battle.tick+10};
    }
    if(stats.element==='air'&&team.coinChance&&this.battle.random()<team.coinChance){
      this.battle.goldEarned[attacker.team]++;this.battle.onGold?.(attacker.team,1);
      this.battle.events.push({type:'gold',id:attacker.id,team:attacker.team,amount:1});
    }
    return stats.element==='water'?attacker.maxHp*team.healPercent:0;
  }
  reflection(target,hpDamage){
    return this.battle.catalog[target.type].element==='mountain'?hpDamage*this.teams[target.team].reflectPercent:0;
  }
  windPierce(attacker,target,damageDealt){
    const rate=this.teams[attacker.team].windPiercePercent;
    if(!rate||damageDealt<=0||this.battle.catalog[attacker.type].element!=='air')return [];
    // Continue to the board edge in the attack's eight-way direction.
    // Gaps and allies do not stop the ray; each enemy takes the same 50% hit.
    const dx=Math.sign(target.x-attacker.x),dy=Math.sign(target.y-attacker.y);
    if(!dx&&!dy)return [];
    const hits=[];
    for(let x=target.x+dx,y=target.y+dy;this.battle.inside(x,y);x+=dx,y+=dy){
      const behind=this.battle.at(x,y);
      if(behind&&behind.team!==attacker.team)hits.push({attacker,target:behind,through:target,amount:damageDealt*rate});
    }
    return hits;
  }
  inherit(fallen){
    const fresh=fallen.filter(u=>u.hp<=0&&!u.eliminated&&!this.inheritedDeaths.has(u.id));
    for(const u of fresh)this.inheritedDeaths.add(u.id);
    for(const team of ['azure','ember']){
      const {inheritanceHpPercent:hpRate,inheritanceAttackPercent:attackRate}=this.teams[team];if(!hpRate&&!attackRate)continue;
      const losses=fresh.filter(u=>u.team===team&&this.battle.catalog[u.type].element==='electric');
      const hp=losses.reduce((sum,u)=>sum+this.baseStats.get(u.id).maxHp*hpRate,0);
      const attack=losses.reduce((sum,u)=>sum+this.baseStats.get(u.id).attackDamage*attackRate,0);
      if(!losses.length)continue;
      for(const u of this.battle.living(team).filter(u=>this.battle.catalog[u.type].element==='electric')){
        u.maxHp+=hp;u.hp=Math.min(u.maxHp,u.hp+hp);u.attackDamage+=attack;
        this.battle.events.push({type:'inheritance',id:u.id,amount:hp,attack});
      }
    }
  }
  eject(wave){
    if(wave.completed)return;wave.completed=true;
    const b=this.battle;
    for(const u of b.living().filter(u=>u.sweptBy===wave.id)){
      // Removal is not death: preserve HP and never resolve death/on-kill effects.
      u.eliminated=true;u.eliminatedBy='tsunami';u.x=b.width;u.targetId=null;
      delete u.sweptBy;delete u.sweepX;delete this.burns[u.id];
      b.events.push({type:'ejected',id:u.id});
    }
  }
  sweep(){
    const {battle}=this;
    for(const wave of this.waves){
      if(wave.completed)continue;
      wave.x=-.5+battle.width*Math.min(1,(battle.tick-wave.startTick)/(wave.endTick-wave.startTick));
      for(const unit of battle.living().filter(u=>u.team!==wave.team)){
        if(!unit.sweptBy&&!wave.hitIds.includes(unit.id)&&!wave.resistedIds.includes(unit.id)&&unit.x<=wave.x){
          if(this.isGolden(unit)||battle.augments?.controlImmune(unit)){wave.resistedIds.push(unit.id);continue;}
          unit.sweptBy=wave.id;unit.targetId=null;wave.hitIds.push(unit.id);
          battle.events.push({type:'swept',id:unit.id});
        }
        if(unit.sweptBy===wave.id)unit.sweepX=wave.x+.5;
      }
    }
    // Both teams' contacts resolve before simultaneous off-board eliminations.
    for(const wave of this.waves)if(battle.tick>=wave.endTick)this.eject(wave);
  }
  damageIntents(){
    const {battle}=this,hits=[];
    for(const storm of this.thunderstorms){
      if(storm.triggered||battle.tick<storm.impactTick)continue;
      storm.triggered=true;
      for(const u of battle.living().filter(u=>u.team!==storm.team)){
        hits.push({targetId:u.id,amount:u.maxHp*.25,executeBelow:.25,sourceId:null,sourceTeam:storm.team,kind:'thunder'});
        storm.targets.push({id:u.id,x:u.sweepX??u.x,y:u.y});
      }
    }
    for(const meteor of this.meteors){
      const target=battle.units.find(u=>u.id===meteor.targetId);
      if(target?.hp>0&&!target.eliminated){meteor.x=target.sweepX??target.x;meteor.y=target.y;}
      if(meteor.impacted||battle.tick<meteor.impactTick)continue;
      meteor.impacted=true;
      const victims=battle.living().filter(u=>u.team!==meteor.team&&Math.abs((u.sweepX??u.x)-meteor.x)+Math.abs(u.y-meteor.y)<=1)
        .sort((a,b)=>(a.id===meteor.targetId?-1:b.id===meteor.targetId?1:a.id-b.id)).slice(0,2);
      for(const u of victims)hits.push({targetId:u.id,amount:u.maxHp*.25,sourceId:null,sourceTeam:meteor.team,kind:'meteor'});
      battle.events.push({type:'meteor-impact',id:meteor.id,x:meteor.x,y:meteor.y,victimIds:victims.map(u=>u.id)});
    }
    for(const [id,burn] of Object.entries(this.burns)){
      const unit=battle.units.find(u=>u.id===Number(id));
      if(!unit||unit.hp<=0||unit.eliminated||this.isGolden(unit)||battle.tick>burn.expires){delete this.burns[id];continue;}
      if(battle.tick>=burn.nextTick){
        hits.push({targetId:unit.id,amount:unit.maxHp*burn.rate,sourceId:burn.sourceId,kind:'burn'});burn.nextTick+=10;
      }
    }
    return hits;
  }
  finish(){
    this.battle.classes?.finish();
    this.battle.augments?.finish();
    // Ending early cancels unfinished waves; it must not eject enemies early.
    for(const u of this.battle.units){
      const base=this.baseStats.get(u.id);u.maxHp=base.maxHp;u.attackDamage=base.attackDamage;u.hp=Math.min(u.hp,u.maxHp);
      u.shield=0;u.maxShield=0;u.goldenUntil=0;u.stunnedUntil=0;u.basicAttacks=0;delete u.sweptBy;delete u.sweepX;
    }
    this.burns={};
  }
}
