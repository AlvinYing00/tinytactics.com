import {hasClass} from './class-rules.js';
import {grantSupportShield,removeSupportShield} from './shields.js';
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

export class ClassEffects {
  constructor(battle){
    this.battle=battle;this.teams=Object.fromEntries(['azure','ember'].map(team=>[team,battle.traits.teams[team].classes]));
    this.nextSupport={azure:50,ember:50};
    for(const unit of battle.units){unit.duelistStacks=0;unit.attackSpeedBonus=0;unit.assassinDodgeUntil=0;unit.openingTargetId=null;unit.completedOpeningJump=false;}
    this.openingJumps();
  }
  has(unit,role){return hasClass(unit,role,this.battle.catalog);}
  active(){return this.battle.phase==='combat';}
  vulnerable(unit){return this.has(unit,'ranger')||this.has(unit,'support');}
  attackRange(unit){return this.battle.catalog[unit.type].range+(this.active()&&this.has(unit,'ranger')?this.teams[unit.team].ranger.rangeBonus:0);}
  attackInterval(unit){return this.battle.catalog[unit.type].attackTicks/(1+(this.active()?unit.attackSpeedBonus||0:0));}
  basicMultiplier(unit,target){return this.active()&&this.has(unit,'ranger')&&distance(unit,target)>=3?1+this.teams[unit.team].ranger.damageBonus:1;}
  championMultiplier(unit,target){return this.active()&&this.battle.tick<50&&this.has(unit,'assassin')&&this.vulnerable(target)?1+this.teams[unit.team].assassin.damageBonus:1;}
  reduction(unit){return this.active()&&this.has(unit,'sentinel')?this.teams[unit.team].sentinel.reduction:0;}
  shieldBypass(unit,target){return this.active()&&this.has(unit,'assassin')&&this.vulnerable(target)?this.teams[unit.team].assassin.shieldBypass:0;}
  dodge(unit){return this.active()&&this.has(unit,'assassin')&&this.battle.tick<unit.assassinDodgeUntil?this.teams[unit.team].assassin.dodgeChance:0;}
  priorityTargets(unit,enemies){
    if(!this.active()||!this.vulnerable(unit)||!enemies.some(e=>this.has(e,'assassin')&&e.completedOpeningJump))return [];
    return enemies.filter(e=>this.has(e,'sentinel')||this.has(e,'duelist'));
  }
  completedAttack(unit){
    if(!this.has(unit,'duelist'))return;
    const rule=this.teams[unit.team].duelist;if(!rule.perAttack)return;
    unit.duelistStacks=Math.min(Math.ceil(rule.cap/rule.perAttack),unit.duelistStacks+1);
    unit.attackSpeedBonus=Math.min(rule.cap,unit.duelistStacks*rule.perAttack);
  }
  openingJumps(){
    const b=this.battle;
    // Opening movement is attempted exactly once, never queued until a wall expires.
    if(this.openingAttempted)return;
    this.openingAttempted=true;
    // Both sides plan from the same opening positions, then land simultaneously.
    const snapshot=b.living().map(u=>({...u})),occupied=new Set(snapshot.map(u=>u.x+','+u.y)),reserved=new Set(),plans=[];
    for(const unit of b.units.filter(u=>this.has(u,'assassin'))){
      if(b.tick<unit.stunnedUntil)continue;
      const priority=u=>this.has(u,'ranger')?0:this.has(u,'support')?1:2;
      const enemies=snapshot.filter(u=>u.team!==unit.team).sort((a,c)=>priority(a)-priority(c)||distance(unit,c)-distance(unit,a)||a.id-c.id);
      for(const target of enemies){
        const cells=[[0,-1],[-1,0],[1,0],[0,1]].map(([dx,dy])=>({x:target.x+dx,y:target.y+dy})).filter(p=>b.inside(p.x,p.y)&&!occupied.has(p.x+','+p.y)&&!reserved.has(p.x+','+p.y)&&b.traits.canStep(unit,unit,p)&&b.traits.canTarget(unit,target,p)).sort((a,c)=>distance(unit,a)-distance(unit,c)||a.y-c.y||a.x-c.x);
        if(!cells.length)continue;
        const to=cells[0];reserved.add(to.x+','+to.y);plans.push({unit,target,to,from:{x:unit.x,y:unit.y}});break;
      }
    }
    for(const {unit,target,to,from} of plans){
      unit.x=to.x;unit.y=to.y;unit.targetId=unit.openingTargetId=target.id;
      unit.assassinDodgeUntil=this.teams[unit.team].assassin.dodgeChance?b.tick+50:0;unit.completedOpeningJump=true;
      b.events.push({type:'jump',id:unit.id,from,to:{...to},targetId:target.id});
    }
  }

  update(){
    const b=this.battle;
    for(const unit of b.units)if(unit.supportShieldUntil&&b.tick>=unit.supportShieldUntil)removeSupportShield(unit);
    for(const team of ['azure','ember']){
      if(b.tick<this.nextSupport[team])continue;
      this.nextSupport[team]+=50;
      const rule=this.teams[team].support,allies=b.living(team);
      if(!rule.targets||!allies.some(u=>this.has(u,'support')))continue;
      const selected=allies.sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp||a.id-c.id).slice(0,rule.targets);
      for(const unit of selected){
        const amount=Math.min(unit.maxHp-unit.hp,unit.maxHp*rule.healPercent);unit.hp+=amount;
        if(amount)b.events.push({type:'heal',id:unit.id,amount,kind:'support'});
        if(rule.shieldPercent){const shield=unit.maxHp*rule.shieldPercent;grantSupportShield(unit,shield,b.tick+30);b.events.push({type:'support-shield',id:unit.id,amount:shield});}
      }
    }
  }
  finish(){
    for(const unit of this.battle.units){unit.duelistStacks=0;unit.attackSpeedBonus=0;unit.assassinDodgeUntil=0;unit.openingTargetId=null;unit.completedOpeningJump=false;removeSupportShield(unit);}
  }
}
