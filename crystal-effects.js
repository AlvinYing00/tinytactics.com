import {teamTraits} from './catalog.js';
import {CrystalProjectileEffects} from './crystal-projectiles.js';
import {hasOrigin,isSand} from './origin-inheritance.js';

// Preparation uses its own random stream: rendering cannot change combat rolls.
export function crystalPreparationTiles(seed,width=8,height=8,team='azure'){
  let state=(seed>>>0)||1;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const cells=[];
  for(let y=0;y<height;y++)if(team==='azure'?y>=height/2:y<height/2)for(let x=0;x<width;x++)cells.push({x,y});
  for(let i=cells.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
  return cells.slice(0,2);
}

export function prismaticTiles(battle,team){
  const tier=battle.traits?.teams[team].crystalTier??teamTraits(battle.living(team),battle.catalog,battle.traitCounts[team]).crystalTier;
  if(tier===6){const cells=[];for(let y=0;y<battle.height;y++)for(let x=0;x<battle.width;x++)if(battle.phase==='combat'||battle.home(team,y))cells.push({x,y});return cells;}
  return battle.crystalTiles[team].slice(0,tier===4?2:tier===2?1:0);
}

const living=u=>u&&u.hp>0&&!u.eliminated;
const position=u=>({x:u.x,y:u.y});
// Test a segment against a tile's bounds, rather than just its center.
function intersects(from,to,unit){
  let low=0,high=1;
  for(const axis of ['x','y']){
    const delta=to[axis]-from[axis],min=unit[axis]-.48,max=unit[axis]+.48;
    if(Math.abs(delta)<1e-9){if(from[axis]<min||from[axis]>max)return false;continue;}
    const a=(min-from[axis])/delta,c=(max-from[axis])/delta;
    low=Math.max(low,Math.min(a,c));high=Math.min(high,Math.max(a,c));if(low>high)return false;
  }
  return true;
}

export class CrystalEffects {
  constructor(battle){
    this.battle=battle;this.pairs=new Map();this.pending=[];this.finished=false;this.projectiles=new CrystalProjectileEffects(battle);
    for(const team of ['azure','ember']){
      const tier=battle.traits.teams[team].crystalTier;
      if(!tier)continue;
      const tiles=this.prismaticTiles(team),owners=battle.living(team).filter(u=>!u.summoned&&hasOrigin(u,'crystal',battle.catalog)).sort((a,b)=>a.id-b.id);
      for(const owner of owners){
        owner.crystalConfined=tier<6;
        if(tier!==6&&!tiles.some(p=>p.x===owner.x&&p.y===owner.y)){if(isSand(owner,battle.catalog))owner.sandCrystalStationary=true;continue;}
        const y=team==='azure'?-1:battle.height;
        const free=Array.from({length:battle.width},(_,x)=>x).filter(x=>!battle.at(x,y)).sort((a,b)=>Math.abs(a-owner.x)-Math.abs(b-owner.x)||a-b);
        if(!free.length)continue;
        const rate=tier===2?.25:.5;
        const range=battle.catalog[owner.type].range+(battle.catalog[owner.type].combatRole==='ranger'?battle.traits.teams[team].classes.ranger.rangeBonus:0);
        const mirror={...owner,id:battle.nextSummonId--,x:free[0],y,hp:owner.maxHp*rate,maxHp:owner.maxHp*rate,attackDamage:owner.attackDamage*rate,
          shield:0,maxShield:0,goldenUntil:0,stunnedUntil:0,frozenUntil:0,fearedUntil:0,chilledUntil:0,chillActive:false,
          targetId:null,attackReady:0,moveReady:0,damageDealt:0,kills:0,basicAttacks:0,summoned:true,sourceId:owner.id,summonKind:'crystal',crystalMirror:true,
          crystalConfined:false,crystalDormant:false,crystalRange:range,crystalAttackTicks:battle.catalog[owner.type].attackTicks};
        delete mirror.supportShield;delete mirror.supportShieldUntil;
        const reflection=battle.augments.has(team,'rainbow-reflection');
        owner.crystalDormant=!reflection;owner.crystalPairId=owner.id;mirror.crystalPairId=owner.id;
        if(reflection)owner.crystalConfined=mirror.crystalConfined=tier<6;
        const pair={ownerId:owner.id,mirrorId:mirror.id,owner,mirror,origin:position(owner),tier,swaps:0,exchanges:0,cooldownUntil:0,losses:{[owner.id]:0,[mirror.id]:0},attacks:{[owner.id]:0,[mirror.id]:0},sweepingOwner:false};
        this.pairs.set(owner.id,pair);battle.units.push(mirror);
        battle.traits.baseStats.set(mirror.id,{maxHp:mirror.maxHp,attackDamage:mirror.attackDamage});
        battle.events.push({type:'crystal-mirror',id:mirror.id,sourceId:owner.id,from:position(owner),to:position(mirror)});
      }
    }
  }
  prismaticTiles(team){return prismaticTiles(this.battle,team);}
  isDormant(unit){return !this.finished&&!!unit.crystalDormant;}
  inTransit(unit){return !this.finished&&this.battle.tick<(unit.crystalSwapUntil||0);}
  onPlatform(unit){return unit.y===-1||unit.y===this.battle.height;}
  canClassMove(unit){return !unit.crystalMirror&&!this.onPlatform(unit)&&!this.isDormant(unit)&&!this.inTransit(unit)&&unit.crystalExchangeTick!==this.battle.tick;}
  confined(unit){return !this.finished&&!!unit.crystalConfined&&!unit.crystalDormant;}
  canStep(unit,from,to,{openingJump=false}={}){
    if(this.isDormant(unit)||this.inTransit(unit))return false;
    if(this.onPlatform(unit))return to.y===unit.y&&to.x>=0&&to.x<this.battle.width;
    if(unit.sandCrystalStationary)return false;
    if(openingJump&&!unit.crystalMirror&&this.battle.augments.has(unit.team,'rainbow-reflection'))return !this.onPlatform(to);
    if(this.confined(unit))return this.battle.home(unit.team,to.y);
    return !this.onPlatform(to);
  }
  canTarget(attacker,target){return !this.isDormant(target)&&!target.crystalRemoved;}
  canReach(attacker,target,from=attacker){
    if(!this.canTarget(attacker,target))return false;
    if(attacker.sandCrystalStationary&&!this.battle.home(attacker.team,target.y))return false;
    if(this.onPlatform(attacker))return true;
    const role=this.battle.catalog[attacker.type].combatRole;
    if(this.onPlatform(target)&&!this.onPlatform(attacker)&&['sentinel','duelist','assassin'].includes(role)&&from.y!==(target.y===-1?0:this.battle.height-1))return false;
    return Math.abs(from.x-target.x)+Math.abs(from.y-target.y)<=this.battle.attackRange(attacker);
  }
  onDamage(unit,before,{kind}={}){
    if(kind==='crystal-projectile'||!living(unit)||this.isDormant(unit)||unit.sweptBy)return;
    const pair=this.pairs.get(unit.crystalPairId);
    if(!pair||pair.tier!==4||pair.sweepingOwner)return;
    pair.losses[unit.id]+=Math.max(0,before-unit.hp);
    if(pair.losses[unit.id]+1e-9>=unit.maxHp*.25)this.exchange(pair,false,unit);
  }
  afterBasic(hit,dealt){
    const unit=hit.attacker,pair=this.pairs.get(unit.crystalPairId);
    if(!pair||pair.tier!==6||!this.canExchange(pair)||this.isDormant(unit)||hit.dodged||hit.repelled||dealt.hpDamage+dealt.shieldDamage<=0)return;
    pair.attacks[unit.id]++;
    if(pair.attacks[unit.id]%3===0)this.exchange(pair,true,unit);
  }
  canExchange(pair){return !this.finished&&!pair.sweepingOwner&&!pair.owner.sweptBy&&!pair.mirror.sweptBy&&this.battle.tick>=pair.cooldownUntil&&living(pair.owner)&&living(pair.mirror);}
  exchange(pair,projectiles=false,trigger){
    if(!this.canExchange(pair))return false;
    const b=this.battle;
    const {owner,mirror}=pair,from=position(owner),to=position(mirror);
    const outgoing=trigger||(this.onPlatform(owner)?owner:mirror);pair.losses[outgoing.id]=0;
    Object.assign(owner,to);Object.assign(mirror,from);
    const reflection=b.augments.has(owner.team,'rainbow-reflection');
    owner.crystalDormant=!reflection&&!this.onPlatform(owner);mirror.crystalDormant=!reflection&&!this.onPlatform(mirror);
    owner.targetId=mirror.targetId=null;owner.openingTargetId=mirror.openingTargetId=null;
    const active=this.onPlatform(owner)?owner:mirror;
    pair.swaps++;pair.exchanges=pair.swaps;pair.cooldownUntil=b.tick+5;
    for(const body of [owner,mirror]){body.crystalSwapUntil=pair.cooldownUntil;body.crystalExchangeTick=b.tick;body.attackReady=Math.max(body.attackReady,pair.cooldownUntil);body.moveReady=Math.max(body.moveReady,pair.cooldownUntil);body.shadowKillerEmpowered=false;b.augments.cancelCrystalMovement(body);}
    if(projectiles){const beams=[[owner,from,to],[mirror,to,from]].map(([source,start,end])=>({ownerId:owner.id,sourceId:source.id,sourceTeam:owner.team,from:start,to:end,amount:source.attackDamage*.5,kind:'crystal-projectile',category:'ability'}));this.pending.push(...beams);this.projectiles.launch(beams);}
    b.events.push({type:'crystal-exchange',id:active.id,sourceId:owner.id,ownerId:owner.id,mirrorId:mirror.id,from,to,swaps:pair.swaps,durationTicks:5,projectiles:projectiles?2:0});
    return true;
  }
  damageIntents(){
    const beams=this.pending;this.pending=[];
    return [...beams.flatMap(beam=>this.battle.living().filter(u=>u.team!==beam.sourceTeam&&!u.sweptBy&&!this.isDormant(u)&&intersects(beam.from,beam.to,u)).map(target=>({...beam,targetId:target.id}))),...this.projectiles.damageIntents()];
  }
  removeMirror(pair,kind='crystal-disappear'){
    const mirror=pair.mirror;if(mirror.crystalRemoved)return;
    mirror.eliminated=true;mirror.crystalRemoved=true;mirror.eliminatedBy=kind;mirror.targetId=null;mirror.crystalDormant=false;
    this.battle.events.push({type:kind==='tsunami'?'out':'crystal-disappear',id:mirror.id});
  }
  returnOwner(pair){
    const {owner,origin}=pair,b=this.battle;if(!this.onPlatform(owner)||owner.sweptBy||owner.eliminated)return;
    // The dormant mirror normally reserves this tile. Preserve the exact starting
    // tile even if another instantaneous mechanic has occupied it in the meantime.
    const blocker=b.at(origin.x,origin.y);
    if(blocker&&blocker!==owner){
      const free=[];for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(!b.at(x,y)&&b.traits.canStep(blocker,blocker,{x,y}))free.push({x,y});
      free.sort((a,c)=>Math.abs(a.x-blocker.x)+Math.abs(a.y-blocker.y)-Math.abs(c.x-blocker.x)-Math.abs(c.y-blocker.y)||a.y-c.y||a.x-c.x);
      if(free.length)Object.assign(blocker,free[0]);
    }
    const from=position(owner);Object.assign(owner,origin);b.events.push({type:'crystal-return',id:owner.id,from,to:{...origin}});
  }
  release(pair){
    this.removeMirror(pair);this.returnOwner(pair);if(!pair.owner.sweptBy){pair.owner.crystalDormant=false;pair.owner.crystalConfined=false;delete pair.owner.crystalSwapUntil;}
    pair.owner.targetId=null;delete pair.owner.crystalPairId;this.pairs.delete(pair.ownerId);
  }
  onDeath(unit){
    const pair=this.pairs.get(unit.crystalPairId);if(!pair)return;
    if(unit.crystalMirror){if(living(pair.owner))this.release(pair);else{this.removeMirror(pair);this.pairs.delete(pair.ownerId);}}
    else{this.removeMirror(pair);this.pairs.delete(pair.ownerId);unit.crystalDormant=false;}
  }
  resolveTsunami(unit){
    const pair=this.pairs.get(unit.crystalPairId);if(!pair)return false;
    if(unit.crystalMirror){this.removeMirror(pair,'tsunami');if(living(pair.owner))this.release(pair);else this.pairs.delete(pair.ownerId);}
    else{pair.sweepingOwner=true;return false;}
    return true;
  }
  onTsunamiExit(unit){const pair=this.pairs.get(unit.crystalPairId);if(pair){this.removeMirror(pair,'tsunami');this.pairs.delete(pair.ownerId);}unit.crystalDormant=false;delete unit.crystalSwapUntil;}
  syncPairs(){for(const pair of [...this.pairs.values()]){
    if(!living(pair.owner)){this.removeMirror(pair);this.pairs.delete(pair.ownerId);}
    else if(!living(pair.mirror))this.release(pair);
    else if(pair.tier===4){for(const active of [pair.owner,pair.mirror])if(!this.isDormant(active)&&pair.losses[active.id]+1e-9>=active.maxHp*.25&&this.exchange(pair,false,active))break;}
  }}
  finish(){
    for(const pair of this.pairs.values())this.returnOwner(pair);
    this.finished=true;this.pending=[];this.pairs.clear();this.projectiles.finish();
    this.battle.units=this.battle.units.filter(u=>!u.crystalMirror);
    for(const unit of this.battle.units)for(const field of ['crystalDormant','crystalConfined','crystalPairId','crystalSwapUntil','crystalExchangeTick'])delete unit[field];
  }
}
