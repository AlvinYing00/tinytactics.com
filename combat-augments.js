import {hasClass} from './class-rules.js';

const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const directions=[[0,-1],[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1],[0,1]];
const alive=unit=>unit&&unit.hp>0&&!unit.eliminated;

// Apply permanent Augments to fresh cost/star stats, never to last round's stats.
// Smaller and Smaller changes basic attacks, not the champion's base Attack.
export function combatAugmentStats(stats,ids=[]){
  const selected=new Set(ids);
  const multiplier=(selected.has('bigger-and-bigger')?1.2:1)*(selected.has('smaller-and-smaller')?.5:1);
  return {...stats,hp:Math.max(1,Math.round(stats.hp*multiplier))};
}

export class CombatAugmentEffects {
  constructor(battle){
    this.battle=battle;
    this.teams=Object.fromEntries(['azure','ember'].map(team=>[team,new Set(battle.teamAugments?.[team]||[])]));
    this.rowProtected=new Set();this.solo=new Set();this.revived=new Set();this.deaths=new Set();this.redeemed=new Set();
    this.started=false;this.finished=false;
    // Eligibility belongs to the placed formation, before any opening jumps.
    for(const team of ['azure','ember']){
      const units=battle.living(team),front=team==='azure'?battle.height/2:battle.height/2-1,back=team==='azure'?battle.height-1:0;
      const rows=new Map();
      for(const unit of units){const row=rows.get(unit.y)||[];row.push(unit);rows.set(unit.y,row);}
      for(const [row,members] of rows){
        if(members.length>=3&&((row===front&&this.has(team,'united-front'))||(row===back&&this.has(team,'united-back'))))for(const unit of members)this.rowProtected.add(unit.id);
        if(members.length===1&&this.has(team,'solo-hero'))this.solo.add(members[0].id);
      }
    }
  }
  has(team,id){return this.teams[team]?.has(id)||false;}
  active(){return this.battle.phase==='combat'&&!this.finished;}
  role(unit,role){return hasClass(unit,role,this.battle.catalog);}
  controlImmune(unit){return this.active()&&this.has(unit.team,'anti-control')&&this.battle.tick<30;}
  immune(unit){
    return this.active()&&((this.battle.tick<30&&this.has(unit.team,'backline-angel')&&this.role(unit,'support'))||(this.battle.tick<20&&this.solo.has(unit.id)));
  }
  start(){
    if(this.started)return;this.started=true;
    const b=this.battle;
    // Establish both sides' protection before either side's opening stun.
    for(const unit of b.living()){
      unit.augmentRowProtection=this.rowProtected.has(unit.id);
      unit.augmentControlUntil=this.has(unit.team,'anti-control')?30:0;
      unit.augmentImmuneUntil=Math.max(this.has(unit.team,'backline-angel')&&this.role(unit,'support')?30:0,this.solo.has(unit.id)?20:0);
      unit.guardianRevived=false;
    }
    for(const team of ['azure','ember']){
      if(!this.has(team,'hold-on'))continue;
      const targets=b.living().filter(unit=>unit.team!==team);
      for(let i=targets.length-1;i>0;i--){const j=Math.floor(b.random()*(i+1));[targets[i],targets[j]]=[targets[j],targets[i]];}
      for(const unit of targets.slice(0,3))if(!this.controlImmune(unit)&&b.traits.applyStun(unit,20))b.events.push({type:'stun',id:unit.id,duration:20,kind:'hold-on'});
    }
  }
  modifyDamage(target,amount,{source,category,kind}={}){
    if(!this.active())return amount;
    if(category==='basic'){
      if(source&&this.has(source.team,'smaller-and-smaller'))amount*=1.5;
      if(source&&this.has(source.team,'anti-shield')&&target.shield>0)amount*=1.25;
      if(this.rowProtected.has(target.id))amount*=.9;
    }
    if(kind==='burn'&&this.has(target.team,'fire-fighter'))amount*=.8;
    if(kind==='thunder'&&this.has(target.team,'anti-shock'))amount*=.5;
    return amount;
  }
  prepareAttack(hit){
    if(!this.active())return hit;
    const {attacker}=hit;
    if(this.has(attacker.team,'weak-hunter')&&this.role(attacker,'assassin')&&this.battle.random()<.25){
      const oldMultiplier=hit.criticalMultiplier||1,newMultiplier=Math.max(oldMultiplier,2);
      hit.amount*=newMultiplier/oldMultiplier;hit.critical=true;hit.criticalMultiplier=newMultiplier;
    }
    hit.royal=this.has(attacker.team,'royal-dancer')&&this.role(attacker,'duelist')&&attacker.basicAttacks>0&&attacker.basicAttacks%10===0;
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
    const from={x:unit.x,y:unit.y};unit.x=to.x;unit.y=to.y;
    if(target)unit.targetId=target.id;
    this.battle.events.push({type:'jump',id:unit.id,from,to:{...to},targetId:target?.id,kind});
  }
  beforeBasic(hit){
    const {attacker,target}=hit,b=this.battle;
    if(!this.active()||!hit.royal||!alive(attacker)||attacker.sweptBy||b.tick<(attacker.stunnedUntil||0))return;
    const cells=this.openCells(attacker,attacker);
    if(cells.length)this.jump(attacker,cells[Math.floor(b.random()*cells.length)],alive(target)?target:null,'royal-dancer');
  }
  afterBasic(hit,dealt){
    if(!this.active())return;
    const {attacker,target}=hit,b=this.battle;
    const total=typeof dealt==='number'?dealt:(dealt?.hpDamage||0)+(dealt?.shieldDamage||0);
    if(total>0&&this.has(attacker.team,'spirit-helper')&&this.role(attacker,'support')){
      const ally=b.living(attacker.team).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp||a.id-c.id)[0];
      this.heal(ally,total*.2,'spirit-helper');
    }
    if(hit.royal&&alive(attacker)&&!attacker.sweptBy){
      this.heal(attacker,attacker.maxHp*.1,'royal-dancer');
    }
  }
  shadowDash(killer){
    const b=this.battle;
    if(!alive(killer)||killer.sweptBy||b.tick<(killer.stunnedUntil||0))return;
    const enemies=b.living().filter(unit=>unit.team!==killer.team&&!unit.sweptBy).sort((a,c)=>distance(killer,a)-distance(killer,c)||a.id-c.id);
    for(const target of enemies){
      const cells=this.openCells(killer,target,[[0,-1],[-1,0],[1,0],[0,1]])
        .filter(cell=>b.traits.canTarget(killer,target,cell)).sort((a,c)=>distance(killer,a)-distance(killer,c)||a.y-c.y||a.x-c.x);
      if(!cells.length)continue;
      this.jump(killer,cells[0],target,'shadow-killer');return;
    }
  }
  onDeath(unit,killer){
    if(!this.active()||unit.hp>0||unit.eliminated||this.deaths.has(unit.id))return [];
    this.deaths.add(unit.id);
    const intents=[];
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
    this.finished=true;
    for(const unit of this.battle.units){delete unit.augmentRowProtection;delete unit.augmentControlUntil;delete unit.augmentImmuneUntil;delete unit.guardianRevived;}
  }
}
