import {hasClass} from './class-rules.js';
import {hasOrigin,isSand} from './origin-inheritance.js';

const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const directions=[[0,-1],[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1],[0,1]];
const alive=unit=>unit&&unit.hp>0&&!unit.eliminated;

// Apply permanent Augments to fresh cost/star stats, never to last round's stats.
// Smaller and Smaller changes basic attacks, not the champion's base Attack.
export function combatAugmentStats(stats,ids=[],placement={}){
  const selected=new Set(ids);
  let multiplier=(selected.has('bigger-and-bigger')?1.2:1)*(selected.has('smaller-and-smaller')?.75:1),damage=stats.damage;
  if(stats.element==='mountain'&&selected.has('mountain-rock'))multiplier*=1.5;
  if(stats.element==='cosmic'&&selected.has('cosmic-aura')&&Number.isInteger(placement.y)){
    const half=(placement.height||8)/2,row=placement.team==='ember'?half-1-placement.y:placement.y-half;
    if(row<2)damage*=1.5;else multiplier*=1.5;
  }
  return {...stats,damage,hp:Math.max(1,Math.round(stats.hp*multiplier))};
}

export class CombatAugmentEffects {
  constructor(battle){
    this.battle=battle;
    this.teams=Object.fromEntries(['azure','ember'].map(team=>[team,new Set(battle.teamAugments?.[team]||[])]));
    this.rowProtected=new Set();this.solo=new Set();this.revived=new Set();this.deaths=new Set();this.redeemed=new Set();
    this.hourglassUsed=new Set();this.hourglassUntil=new Map();
    this.started=false;this.finished=false;
    this.crystalMovements=[];
    // Eligibility belongs to the placed formation, before any opening jumps.
    for(const team of ['azure','ember']){
      const units=battle.living(team).filter(u=>!u.summoned),front=team==='azure'?battle.height/2:battle.height/2-1,back=team==='azure'?battle.height-1:0;
      const rows=new Map();
      for(const unit of units){const row=rows.get(unit.y)||[];row.push(unit);rows.set(unit.y,row);}
      for(const [row,members] of rows){
        if(members.length>=3&&((row===front&&this.has(team,'united-front'))||(row===back&&this.has(team,'united-back'))))for(const unit of members)this.rowProtected.add(unit.id);
        if(members.length===1&&this.has(team,'solo-hero'))this.solo.add(members[0].id);
      }
    }
  }
  has(team,id){return this.teams[team]?.has(id)||false;}
  origin(unit,origin){return hasOrigin(unit,origin,this.battle.catalog);}
  active(){return this.battle.phase==='combat'&&!this.finished;}
  role(unit,role){return !unit.crystalMirror&&hasClass(unit,role,this.battle.catalog);}
  controlImmune(unit){return this.active()&&this.has(unit.team,'anti-control')&&this.battle.tick<30;}
  immune(unit){
    return this.active()&&((this.battle.tick<(this.hourglassUntil.get(unit.id)||0))||(this.battle.traits.isGolden(unit)&&this.has(unit.team,'golden-reflection')&&this.origin(unit,'mountain'))||(this.battle.tick<30&&this.has(unit.team,'backline-angel')&&this.role(unit,'support'))||(this.battle.tick<20&&this.solo.has(unit.id)));
  }
  protectWithHourglass(unit,hpDamage,{execute=false,amount=hpDamage}={}){
    if(!this.active()||!alive(unit)||unit.summoned||unit.crystalMirror||!isSand(unit,this.battle.catalog)||!this.has(unit.team,'hourglass')||this.hourglassUsed.has(unit.id))return false;
    // Predict the fully resolved HP hit before spending either HP or shields.
    // The triggering hit is prevented in full, including a One Shot execution.
    if(!execute&&(amount<=0||unit.hp-hpDamage>=unit.maxHp*.5))return false;
    this.hourglassUsed.add(unit.id);this.hourglassUntil.set(unit.id,this.battle.tick+30);
    unit.hourglassUntil=this.battle.tick+30;
    this.battle.events.push({type:'hourglass',id:unit.id,duration:30,kind:'hourglass'});
    return true;
  }
  start(){
    if(this.started)return;this.started=true;
    const b=this.battle;
    // Establish both sides' protection before either side's opening stun.
    for(const unit of b.living()){
      unit.augmentRowProtection=this.rowProtected.has(unit.id);
      unit.augmentControlUntil=this.has(unit.team,'anti-control')?30:0;
      unit.augmentImmuneUntil=Math.max(this.has(unit.team,'backline-angel')&&this.role(unit,'support')?30:0,this.solo.has(unit.id)?20:0);
      unit.guardianRevived=false;unit.shadowKillerEmpowered=false;
      delete unit.hourglassUntil;
      if(this.origin(unit,'cosmic')&&this.has(unit.team,'cosmic-wish'))unit.hp*=.5;
    }
    for(const team of ['azure','ember']){
      if(!this.has(team,'hold-on'))continue;
      const targets=b.living().filter(unit=>unit.team!==team&&!unit.crystalDormant);
      for(let i=targets.length-1;i>0;i--){const j=Math.floor(b.random()*(i+1));[targets[i],targets[j]]=[targets[j],targets[i]];}
      for(const unit of targets.slice(0,3))if(!this.controlImmune(unit)&&b.traits.applyStun(unit,20))b.events.push({type:'stun',id:unit.id,duration:20,kind:'hold-on'});
    }
  }
  modifyDamage(target,amount,{source,category,kind}={}){
    if(!this.active())return amount;
    if(category==='basic'){
      const element=source&&this.battle.catalog[source.type]?.element;
      if(this.origin(source,'water')&&this.has(source.team,'water-spark'))amount*=2;
      if(this.origin(source,'air')&&this.has(source.team,'wind-assault')&&this.battle.traits.walls.some(w=>w.team===source.team&&this.battle.traits.wallActive(w)))amount*=1.5;
      if(this.origin(source,'light')&&this.has(source.team,'lighten-the-way')&&this.battle.tick<(target.stunnedUntil||0))amount*=1.5;
      if(this.origin(source,'dark')&&this.has(source.team,'darken-the-world')&&this.battle.controls.feared(target))amount*=1.5;
      if(this.origin(source,'ice')&&this.has(source.team,'in-freeze')&&this.battle.controls.frozen(target))amount*=2;
      if(source&&!source.crystalMirror&&this.has(source.team,'smaller-and-smaller'))amount*=1.5;
      if(source&&!source.crystalMirror&&this.has(source.team,'anti-shield')&&target.shield>0)amount*=1.25;
      if(this.rowProtected.has(target.id))amount*=.9;
    }
    if(kind==='burn'&&this.has(target.team,'fire-fighter'))amount*=.8;
    if(kind==='thunder'&&this.has(target.team,'anti-shock'))amount*=.5;
    return amount;
  }
  prepareAttack(hit){
    if(!this.active()||hit.attacker.crystalMirror)return hit;
    const {attacker}=hit;
    if(this.has(attacker.team,'weak-hunter')&&this.role(attacker,'assassin')&&this.battle.random()<.25){
      const oldMultiplier=hit.criticalMultiplier||1,newMultiplier=Math.max(oldMultiplier,2);
      hit.amount*=newMultiplier/oldMultiplier;hit.critical=true;hit.criticalMultiplier=newMultiplier;
    }  // Shadow Killer empowered attack:
  // remove crit -> apply +50% -> reapply crit
  if(
    attacker.shadowKillerEmpowered &&
    this.has(attacker.team,'shadow-killer') &&
    this.role(attacker,'assassin')
  ){
    const crit=hit.criticalMultiplier||1;

    hit.amount=(hit.amount/crit)*1.5*crit;

    hit.shadowKiller=true;
    attacker.shadowKillerEmpowered=false;
  }
    const crystalCanMove=!this.origin(attacker,'crystal')||this.battle.crystal?.canClassMove(attacker);
    hit.royal=!!crystalCanMove&&this.has(attacker.team,'royal-dancer')&&this.role(attacker,'duelist')&&attacker.basicAttacks>0&&attacker.basicAttacks%3===0;
    if(hit.royal)hit.amount*=1.5;
    return hit;
  }
  repels(hit){
    return this.active()&&!hit.dodged&&hit.amount>0&&alive(hit.target)&&!this.immune(hit.target)&&this.has(hit.target.team,'grand-challenge')&&this.role(hit.target,'duelist')&&this.battle.random()<.3;
  }
  revive(target){
    if(!this.active()||target.hp>0||target.eliminated||!this.has(target.team,'guardian-angel')||!this.role(target,'ranger')||this.revived.has(target.id))return false;
    this.revived.add(target.id);target.guardianRevived=true;target.hp=target.maxHp*.1;target.attackDamage*=.5;
    this.battle.events.push({type:'revive',id:target.id,amount:target.hp,kind:'guardian-angel'});
    return true;
  }
  heal(unit,amount,kind){
    if(!alive(unit)||amount<=0)return;
    const healed=Math.min(unit.maxHp-unit.hp,amount);
    if(healed<=0)return;
    unit.hp+=healed;this.battle.events.push({type:'heal',id:unit.id,amount:healed,kind});
  }
  openCells(unit,origin,offsets=directions){
    const b=this.battle;
    return offsets.map(([dx,dy])=>({x:origin.x+dx,y:origin.y+dy})).filter(cell=>b.inside(cell.x,cell.y)&&!b.at(cell.x,cell.y)&&b.traits.canStep(unit,unit,cell));
  }
  jump(unit,to,target,kind){
    if(this.origin(unit,'crystal')&&!this.battle.crystal?.canClassMove(unit))return false;
    const from={x:unit.x,y:unit.y};unit.x=to.x;unit.y=to.y;
    if(target)unit.targetId=target.id;
    this.battle.events.push({type:'jump',id:unit.id,from,to:{...to},targetId:target?.id,kind});
    return true;
  }
  cancelCrystalMovement(unit){this.crystalMovements=this.crystalMovements.filter(move=>move.unit.id!==unit.id);}
  deferCrystalMovement(unit,kind,target){
    const competingSand=isSand(unit,this.battle.catalog)&&this.role(unit,'duelist')&&this.role(unit,'assassin')&&this.has(unit.team,'royal-dancer')&&this.has(unit.team,'shadow-killer');
    if(!competingSand&&!this.battle.crystal?.pairs.has(unit.crystalPairId))return false;
    this.crystalMovements.push({unit,kind,target});return true;
  }
  flushCrystalMovement(){
    const pending=this.crystalMovements;this.crystalMovements=[];
    // All committed hits, reflections and deaths get their exchange opportunity
    // before a linked owner's class movement. Cancelled dashes are never retried.
    // Sand's Royal damage/heal already resolved with its attack. Select only one
    // movement after takedowns are known; an exchange can cancel both beforehand.
    const movedSand=new Set();
    for(let move of pending){
      if(isSand(move.unit,this.battle.catalog)){
        if(movedSand.has(move.unit.id))continue;
        movedSand.add(move.unit.id);
        move=pending.find(other=>other.unit.id===move.unit.id&&other.kind==='shadow-killer')||move;
      }
      const {unit,kind,target}=move;
      if(!this.battle.crystal?.canClassMove(unit))continue;
      if(kind==='royal-dancer')this.royalDash({attacker:unit,target,royal:true});
      else this.shadowDash(unit,true);
    }
  }
  beforeBasic(hit){
    const {attacker}=hit;
    if(!hit.royal)return;
    if(this.deferCrystalMovement(attacker,'royal-dancer',hit.target))return;
    this.royalDash(hit);
  }
  royalDash(hit){
    const {attacker,target}=hit,b=this.battle;
    if(attacker.crystalMirror||b.crystal?.onPlatform(attacker)||!this.active()||!hit.royal||!alive(attacker)||attacker.sweptBy||b.controls?.cannotAttack(attacker)||b.tick<(attacker.stunnedUntil||0))return;
    const cells=this.openCells(attacker,attacker);
    if(cells.length)this.jump(attacker,cells[Math.floor(b.random()*cells.length)],alive(target)?target:null,'royal-dancer');
  }
  afterBasic(hit,dealt){
    if(!this.active())return [];
    const {attacker,target}=hit,b=this.battle;
    const total=typeof dealt==='number'?dealt:(dealt?.hpDamage||0)+(dealt?.shieldDamage||0);
    if(total>0&&this.has(attacker.team,'spirit-helper')&&this.role(attacker,'support')){
      const ally=b.living(attacker.team).filter(u=>!u.crystalMirror).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp||a.id-c.id)[0];
      this.heal(ally,total*.2,'spirit-helper');
    }
    if(hit.royal&&alive(attacker)&&!attacker.sweptBy){
      this.heal(attacker,attacker.maxHp*.1,'royal-dancer');
    }
    const element=b.catalog[attacker.type]?.element,intents=[];
    if(this.origin(attacker,'cosmic')&&this.has(attacker.team,'cosmic-wish'))this.heal(attacker,total,'cosmic-wish');
    if(!hit.dodged&&!hit.repelled&&total>0&&this.origin(attacker,'fire')&&this.has(attacker.team,'fire-cracker')){
      b.events.push({type:'fire-cracker-burst',sourceId:attacker.id,targetId:target.id,x:target.sweepX??target.x,y:target.y,radius:1});
      for(const enemy of b.living().filter(u=>u.team!==attacker.team&&u.id!==target.id&&Math.max(Math.abs(u.x-target.x),Math.abs(u.y-target.y))<=1))intents.push({source:attacker,target:enemy,amount:hit.amount*.5,kind:'fire-cracker'});
    }
    // A completed attack emits a separate global shock, never another on-hit.
    if(this.origin(attacker,'electric')&&this.has(attacker.team,'electric-strike')){
      const enemies=b.living().filter(u=>u.team!==attacker.team);
      b.events.push({type:'electric-strike-chain',sourceId:attacker.id,targetId:target.id,from:{x:attacker.sweepX??attacker.x,y:attacker.y},targets:enemies.map(u=>({id:u.id,x:u.sweepX??u.x,y:u.y}))});
      for(const enemy of enemies)intents.push({source:attacker,target:enemy,amount:attacker.attackDamage*.05,kind:'electric-strike'});
    }
    return intents;
  }
  shadowDash(killer,deferred=false){
    const b=this.battle;
    if(killer.crystalMirror||b.crystal?.onPlatform(killer)||!alive(killer)||killer.sweptBy||b.controls?.immobile(killer)||b.tick<(killer.stunnedUntil||0))return;
    if(!deferred&&this.deferCrystalMovement(killer,'shadow-killer'))return;
    // A surviving Crystal 6 pair retains its existing targeting/movement rules.
    const pair=b.crystal?.pairs.get(killer.crystalPairId),linkedCrystal=pair?.tier===6&&alive(pair.owner)&&alive(pair.mirror);
    const enemies=b.living().filter(unit=>unit.team!==killer.team&&!unit.sweptBy&&b.targetable(killer,unit)).sort((a,c)=>(linkedCrystal?0:a.hp-c.hp)||distance(killer,a)-distance(killer,c)||a.id-c.id);
    for(const target of enemies){
      // A crowded target permits a nearby landing, never a partial dash toward
      // the opposite side of an active Wind Wall or outside Crystal confinement.
      if(!linkedCrystal&&!b.traits.canStep(killer,killer,{x:target.x,y:Math.max(0,Math.min(b.height-1,target.y))}))continue;
      const candidates=linkedCrystal?this.openCells(killer,target,[[0,-1],[-1,0],[1,0],[0,1]]):Array.from({length:b.width*b.height},(_,i)=>({x:i%b.width,y:Math.floor(i/b.width)}))
        .filter(cell=>!b.at(cell.x,cell.y)&&b.traits.canStep(killer,killer,cell));
      const cells=candidates.filter(cell=>b.traits.canTarget(killer,target,cell))
        .sort((a,c)=>(linkedCrystal?0:distance(a,target)-distance(c,target))||distance(killer,a)-distance(killer,c)||a.y-c.y||a.x-c.x);
      if(!cells.length)continue;
      if(this.jump(killer,cells[0],target,'shadow-killer'))killer.shadowKillerEmpowered=true;return;
    }
  }
  onDeath(unit,killer){
    if(!this.active()||unit.hp>0||unit.eliminated||this.deaths.has(unit.id))return [];
    this.deaths.add(unit.id);
    const intents=[];
    if(killer&&killer.team!==unit.team&&this.origin(killer,'ice')&&this.has(killer.team,'xmas-gift')){
      const amount=this.battle.catalog[unit.type]?.cost||0;
      this.battle.goldEarned[killer.team]+=amount;this.battle.onGold?.(killer.team,amount);this.battle.events.push({type:'gold',id:killer.id,team:killer.team,amount});
    }
    if(this.has(unit.team,'suicide-frontliner')&&this.role(unit,'sentinel')){
      const separation=enemy=>Math.abs((unit.sweepX??unit.x)-(enemy.sweepX??enemy.x))+Math.abs(unit.y-enemy.y);
      const target=this.battle.living().filter(enemy=>enemy.team!==unit.team).sort((a,c)=>separation(a)-separation(c)||a.id-c.id)[0];
      if(target)intents.push({source:unit,target,amount:unit.maxHp*.25,kind:'explosion'});
    }
    if(killer&&killer.team!==unit.team&&this.has(killer.team,'shadow-killer')&&this.role(killer,'assassin'))this.shadowDash(killer);
    return intents;
  }
  update(){
    if(!this.active()||this.battle.tick<50)return;
    for(const team of ['azure','ember']){
      if(!this.has(team,'redemption')||this.redeemed.has(team))continue;
      this.redeemed.add(team);
      for(const unit of this.battle.living(team))this.heal(unit,unit.maxHp*.2,'redemption');
    }
  }
  finish(){
    this.finished=true;this.crystalMovements=[];
    for(const unit of this.battle.units){delete unit.augmentRowProtection;delete unit.augmentControlUntil;delete unit.augmentImmuneUntil;delete unit.guardianRevived;delete unit.shadowKillerEmpowered;delete unit.hourglassUntil;}
  }
}
