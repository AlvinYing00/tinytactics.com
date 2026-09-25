// Pure simulation. UI, audio and animation never decide combat outcomes.
import { CHAMPIONS, ARCHETYPES, championStats } from './catalog.js';
import { TraitEffects } from './trait-effects.js';
export { ARCHETYPES } from './catalog.js';
export const distance = (a,b) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const key = p => `${p.x},${p.y}`;
const clone = value => JSON.parse(JSON.stringify(value));
export class Battle {
  constructor({width=8,height=8,cap=10,timeout=600,catalog=CHAMPIONS,seed=1,random,onGold}={}) {
    this.width=width; this.height=height; this.cap=cap; this.timeout=timeout; this.catalog=catalog;
    this.units=[]; this.nextId=1; this.phase='preparation'; this.outcome=null;
    this.tick=0; this.accumulator=0; this.events=[]; this.roster=null;
    this.traits=null;
    this.seed=seed>>>0||1;this.randomState=this.seed;this.onGold=onGold;this.goldEarned={azure:0,ember:0};
    this.random=random||(()=>{let x=this.randomState;x^=x<<13;x^=x>>>17;x^=x<<5;this.randomState=x>>>0;return this.randomState/4294967296;});
  }
  inside(x,y) { return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<this.width&&y>=0&&y<this.height; }
  home(team,y) { return team==='azure' ? y>=this.height/2 : y<this.height/2; }
  at(x,y) { return this.units.find(u=>u.hp>0&&!u.sweptBy&&u.x===x&&u.y===y); }
  living(team) { return this.units.filter(u=>u.hp>0&&(!team||u.team===team)); }
  editable() { if(this.phase!=='preparation') throw new Error('Finish the battle or reset before changing your formation.'); }
  validate(team,x,y,ignoreId) {
    this.editable();
    if(!['azure','ember'].includes(team)) throw new Error('Choose a valid team.');
    if(!this.inside(x,y)) throw new Error('Choose a tile on the battlefield.');
    if(!this.home(team,y)) throw new Error('Place your champions in your half of the board.');
    const occupant=this.at(x,y);
    if(occupant&&occupant.id!==ignoreId) throw new Error('That tile is occupied. Choose an empty tile.');
  }
  place(type,team,x,y,stars=1) {
    this.validate(team,x,y);
    const stats=championStats(type,stars,this.catalog);
    if(this.living(team).length>=this.cap) throw new Error(`Your squad is full. Remove a champion first (${this.cap} maximum).`);
    const u={id:this.nextId++,type,team,x,y,stars,hp:stats.hp,maxHp:stats.hp,attackDamage:stats.damage,damageType:stats.damageType||'physical',shield:0,maxShield:0,goldenUntil:0,stunnedUntil:0,airBoosted:false,targetId:null,attackReady:0,moveReady:0,damageDealt:0,kills:0};
    this.units.push(u); return u;
  }
  move(id,x,y) {
    const u=this.units.find(v=>v.id===id); if(!u) throw new Error('Choose a champion first.');
    this.validate(u.team,x,y,id); u.x=x;u.y=y;
  }
  moveOrSwap(id,x,y) {
    this.editable();
    const u=this.units.find(v=>v.id===id&&v.hp>0);
    if(!u)throw new Error('Choose a champion first.');
    const other=this.at(x,y);
    if(other&&other.team!==u.team)throw new Error('You can only swap champions on your own team.');
    this.validate(u.team,x,y,other?.id);
    this.validate(u.team,u.x,u.y,u.id);
    if(other===u)return null;
    const origin={x:u.x,y:u.y};
    u.x=x;u.y=y;
    if(other){other.x=origin.x;other.y=origin.y;}
    return other||null;
  }
  remove(id) { this.editable(); this.units=this.units.filter(u=>u.id!==id); }
  start() {
    this.editable();
    if(!this.living('azure').length||!this.living('ember').length) throw new Error('Both teams need at least one champion.');
    this.roster=clone(this.units); this.phase='combat'; this.tick=0; this.accumulator=0; this.outcome=null;this.events=[];
    this.randomState=this.seed;this.goldEarned={azure:0,ember:0};
    this.traits=new TraitEffects(this);
  }
  reset() {
    if(this.roster) this.units=clone(this.roster);
    this.phase='preparation';this.tick=0;this.accumulator=0;this.outcome=null;this.events=[];this.roster=null;
    this.traits=null;
    this.randomState=this.seed;this.goldEarned={azure:0,ember:0};
  }
  drainEvents() { const events=this.events;this.events=[];return events; }
  advance(seconds) {
    if(!Number.isFinite(seconds)||seconds<0) throw new Error('Elapsed time must be finite and non-negative.');
    if(this.phase!=='combat')return;
    this.accumulator+=seconds;
    while(this.accumulator+1e-9>=0.05&&this.phase==='combat') { this.accumulator-=0.05;this.step(); }
  }
  // BFS considers every reachable cell; a blocked nearest enemy cannot trap targeting.
  route(unit, enemies, occupied) {
    const dirs=unit.team==='azure'?[[0,-1],[-1,0],[1,0],[0,1]]:[[0,1],[1,0],[-1,0],[0,-1]];
    const queue=[{x:unit.x,y:unit.y,first:null}], seen=new Set([key(unit)]);
    const range=this.catalog[unit.type].range;
    for(let i=0;i<queue.length;i++) {
      const cell=queue[i];
      const targets=enemies.filter(e=>(!this.traits||this.traits.canTarget(unit,e))&&distance(cell,e)<=range).sort((a,b)=>distance(unit,a)-distance(unit,b)||a.id-b.id);
      if(targets.length) return {target:targets[0],next:cell.first};
      for(const [dx,dy] of dirs) {
        const p={x:cell.x+dx,y:cell.y+dy},k=key(p);
        if(this.inside(p.x,p.y)&&!seen.has(k)&&!occupied.has(k)&&(!this.traits||this.traits.canStep(unit,cell,p))) {seen.add(k);queue.push({...p,first:cell.first||p});}
      }
    }
    return null;
  }
  step() {
    // Keep decisecond timers; half ticks represent exact 1.25-second attacks.
    this.tick+=0.5;
    this.traits.sweep();
    const alive=this.living().filter(u=>!u.sweptBy), occupied=new Set(alive.map(key)), reserved=new Set();
    // Rotate initiative so contested movement is not always resolved for one team.
    const order=alive.slice(); const offset=Math.round(this.tick*2)%Math.max(1,order.length);
    const moves=[];
    for(const u of order.slice(offset).concat(order.slice(0,offset))) {
      if(this.tick<u.stunnedUntil){u.targetId=null;continue;}
      const enemies=alive.filter(e=>e.team!==u.team);
      const route=this.route(u,enemies,occupied);u.targetId=route?.target.id??null;
      if(route?.next&&this.tick>=u.moveReady&&!reserved.has(key(route.next))) {
        reserved.add(key(route.next));moves.push({unit:u,next:route.next});
      }
    }
    for(const {unit:u,next} of moves) {
      this.events.push({type:'move',id:u.id,from:{x:u.x,y:u.y},to:next});
      u.x=next.x;u.y=next.y;u.moveReady=this.tick+this.catalog[u.type].moveTicks;
    }
    // A unit walking into the moving wave is caught during the same tick.
    this.traits.sweep();
    const hits=[];
    for(const u of alive) {
      if(u.sweptBy||u.hp<=0||this.tick<u.stunnedUntil)continue;
      const stats=this.catalog[u.type];
      const candidates=alive.filter(e=>!e.sweptBy&&e.hp>0&&e.team!==u.team&&this.traits.canTarget(u,e)&&distance(u,e)<=stats.range)
        .sort((a,b)=>(a.id===u.targetId?-1:b.id===u.targetId?1:distance(u,a)-distance(u,b)||a.id-b.id));
      if(candidates.length)u.targetId=candidates[0].id;
      if(candidates.length&&this.tick>=u.attackReady) {
        const target=candidates[0];hits.push({attacker:u,target,amount:u.attackDamage});
        u.attackReady=this.tick+stats.attackTicks;
      }
    }
    // All attacks are committed together: a mutual knockout is a real draw.
    const damage=new Map(), healing=new Map(),executions=new Set();
    for(const {attacker,target,amount} of hits) {
      attacker.damageDealt+=amount;damage.set(target.id,(damage.get(target.id)||0)+amount);
      this.events.push({type:'attack',id:attacker.id,targetId:target.id,amount,damageType:attacker.damageType});
      const heal=this.traits.onAttack(attacker,target);
      if(heal)healing.set(attacker.id,(healing.get(attacker.id)||0)+heal);
    }
    for(const effect of this.traits.damageIntents()){
      if(effect.execute)executions.add(effect.targetId);
      damage.set(effect.targetId,(damage.get(effect.targetId)||0)+effect.amount);
      const source=this.units.find(u=>u.id===effect.sourceId);if(source)source.damageDealt+=effect.amount;
      this.events.push({type:effect.kind,id:effect.targetId,amount:effect.amount,execute:!!effect.execute});
    }
    for(const u of this.living()) {
      // Water heals on a committed attack, before this tick's simultaneous damage.
      const restored=Math.min(u.maxHp-u.hp,healing.get(u.id)||0);
      if(restored)this.events.push({type:'heal',id:u.id,amount:restored});
      const incoming=damage.get(u.id)||0,absorbed=Math.min(u.shield,incoming);u.shield-=absorbed;
      u.hp=executions.has(u.id)?0:Math.max(0,Math.min(u.maxHp,u.hp+restored)-(incoming-absorbed));
      if(executions.has(u.id))u.eliminatedBy='thunder';
      if(u.hp===0) {
        this.events.push({type:'death',id:u.id});
        const killer=hits.find(h=>h.target.id===u.id);if(killer)killer.attacker.kills++;
      }
    }
    for(const u of this.living()) if(!this.units.some(t=>t.id===u.targetId&&t.hp>0&&!t.sweptBy)) u.targetId=null;
    const azure=this.living('azure').length,ember=this.living('ember').length;
    if(!azure||!ember||this.tick>=this.timeout) {
      this.phase='finished';this.outcome=!azure&&!ember?'draw':!ember?'azure':!azure?'ember':'draw';
      this.traits.finish();
      this.events.push({type:'end',outcome:this.outcome});
    }
  }
}
export const FORMATIONS = [
  [['sentinel',2,2],['sentinel',5,2],['duelist',4,1],['ranger',1,0],['ranger',6,0]],
  [['sentinel',3,2],['duelist',1,2],['duelist',6,2],['ranger',2,0],['ranger',5,0]],
  [['sentinel',2,2],['sentinel',4,2],['sentinel',6,2],['ranger',3,0],['duelist',5,1]]
];
export function createSkirmish(formation=0) {
  const b=new Battle();
  const elements=['mountain','fire','electric','water','air'];
  FORMATIONS[formation%FORMATIONS.length].forEach(([type,x,y],i)=>b.place(`${elements[i]}-${type}-${1+formation%2}`,'ember',x,y));
  [['sentinel',2,5],['sentinel',5,5],['duelist',4,6],['ranger',1,7],['ranger',6,7]].forEach(([type,x,y],i)=>b.place(`${elements[i]}-${type}-1`,'azure',x,y));
  return b;
}
export function applyTraitFormation(battle,element){
  battle.editable();
  if(!['fire','water'].includes(element))throw new Error('Choose the Fire or Water trait preset.');
  battle.living('azure').forEach(u=>battle.remove(u.id));
  const roster=Object.values(CHAMPIONS).filter(c=>c.element===element&&c.cost<=3).concat(CHAMPIONS[`${element}-legendary`]);
  const positions={sentinel:[[1,4],[3,4],[5,4]],duelist:[[2,5],[4,5],[6,5]],ranger:[[1,7],[3,7],[5,7],[7,7]]};
  for(const champion of roster){const [x,y]=positions[champion.combatRole].shift();battle.place(champion.id,'azure',x,y);}
}
