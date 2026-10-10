// Committed attacks resolve together. Secondary effects never create attacks.
import {absorbShield} from './shields.js';

function damageAmount(target,amount,options){
  const {source,battle,category='trait'}=options;
  if(source&&category!=='reflection'&&battle?.catalog[source.type]?.element==='light'&&battle.catalog[target.type]?.element==='dark')amount*=2;
  if((category==='basic'||category==='ability')&&battle?.classes){
    if(source)amount*=battle.classes.championMultiplier(source,target);
    amount*=1-battle.classes.reduction(target);
  }
  return Math.max(0,battle?.augments?.modifyDamage(target,amount,options)??amount);
}

export function applyDamage(target,amount,{source,sourceTeam=source?.team,execute=false,battle,category='trait',kind=category}={}){
  if(target.hp<=0||target.eliminated||battle?.augments?.immune(target))return {hpDamage:0,shieldDamage:0};
  amount=damageAmount(target,amount,{source,sourceTeam,battle,category,kind});
  const bypass=category==='basic'&&source?(battle?.classes?.shieldBypass(source,target)||0):0;
  const before=target.hp;
  const shieldDamage=execute?0:absorbShield(target,amount*(1-bypass));
  target.hp=execute?0:Math.max(0,target.hp-(amount-shieldDamage));
  // Execution is tied to a damaging team hit, not a passive HP scan or reflection.
  if(amount>0&&category!=='reflection'&&sourceTeam!==target.team&&battle?.augments?.has(sourceTeam,'executioner')&&target.hp>0&&target.hp<target.maxHp*.1){target.hp=0;execute=true;}
  const hpDamage=before-target.hp;
  let revived=false;
  if(target.hp===0){
    revived=!!battle?.augments?.revive(target);
    if(!revived){
      target.lastKillerId=source?.id??null;
      if(source)source.kills=(source.kills||0)+1;
    }
  }
  if(source)source.damageDealt=(source.damageDealt||0)+hpDamage+shieldDamage;
  return {hpDamage,shieldDamage,...(execute&&!revived?{execute:true}:{}),...(revived?{revived:true}:{})};
}

export function resolveCombat(battle,hits){
  hits=hits.filter(({attacker,target})=>!attacker.eliminated&&!target.eliminated&&!attacker.sweptBy&&!target.sweptBy);
  const traits=battle.traits,augments=battle.augments,alive=battle.living(),healing=new Map(),reflections=[],pierces=[],controlHits=[];
  for(const hit of hits){
    hit.repelled=!!augments?.repels(hit);
    const heal=traits.onAttack(hit.attacker,hit.target,hit.dodged||hit.repelled);
    if(heal)healing.set(hit.attacker.id,(healing.get(hit.attacker.id)||0)+heal);
  }
  for(const u of alive){
    const restored=Math.min(u.maxHp-u.hp,healing.get(u.id)||0);u.hp+=restored;
    if(restored)battle.events.push({type:'heal',id:u.id,amount:restored});
  }
  for(const hit of hits){
    const {attacker,target,amount,critical,dodged,repelled}=hit;
    augments?.beforeBasic(hit);
    const oneShot=!dodged&&!repelled&&amount>0&&target.hp>0&&augments?.has(attacker.team,'one-shot')&&battle.classes?.has(attacker,'ranger')&&battle.random()<.05;
    const dealt=repelled?{hpDamage:0,shieldDamage:0}:applyDamage(target,amount,{source:attacker,battle,category:'basic',execute:oneShot});
    battle.events.push({type:'attack',id:attacker.id,targetId:target.id,amount:dealt.hpDamage+dealt.shieldDamage,critical,dodged,repelled,damageType:attacker.damageType,...dealt});
    const reflected=repelled?damageAmount(target,amount,{source:attacker,battle,category:'basic',kind:'basic'}):traits.reflection(target,dealt.hpDamage);
    if(reflected)reflections.push({source:target,target:attacker,amount:reflected,kind:repelled?'repel':'reflection'});
    if(!dodged&&!repelled)pierces.push(...traits.windPierce(attacker,target,dealt.hpDamage+dealt.shieldDamage));
    controlHits.push(...augments?.afterBasic(hit,dealt)||[]);
    controlHits.push(...battle.controls?.afterBasic(hit,dealt)||[]);
  }
  // Royal Dancer can move during a committed attack; sample arrow tiles afterward.
  controlHits.unshift(...battle.controls?.damageIntents()||[]);
  for(const hit of controlHits){
    const dealt=applyDamage(hit.target,hit.amount,{source:hit.source,sourceTeam:hit.sourceTeam??hit.source?.team,battle,kind:hit.kind});
    if(hit.kind==='heaven-arrow')battle.controls.addLightStacks(hit.target,hit.sourceTeam);
    battle.events.push({type:hit.kind,id:hit.target.id,sourceId:hit.source?.id,amount:dealt.hpDamage+dealt.shieldDamage,storm:hit.storm,...dealt});
  }
  for(const {attacker,target,through,amount} of pierces){
    const dealt=applyDamage(target,amount,{source:attacker,battle,kind:'pierce'}),total=dealt.hpDamage+dealt.shieldDamage;
    if(total)battle.events.push({type:'pierce',id:target.id,sourceId:attacker.id,throughId:through.id,amount:total,...dealt});
  }
  // Thresholds are checked immediately before each environmental hit lands.
  for(const effect of traits.damageIntents()){
    const target=battle.units.find(u=>u.id===effect.targetId);if(!target||target.hp<=0||target.eliminated)continue;
    const source=battle.units.find(u=>u.id===effect.sourceId);
    const execute=effect.executeBelow!==undefined&&target.hp<target.maxHp*effect.executeBelow;
    const dealt=applyDamage(target,effect.amount,{source,sourceTeam:effect.sourceTeam??source?.team,execute,battle,kind:effect.kind});
    if(dealt.execute&&target.hp<=0)target.eliminatedBy=effect.kind;
    battle.events.push({type:effect.kind,id:target.id,amount:dealt.hpDamage+dealt.shieldDamage,...dealt});
  }
  for(const hit of reflections){
    const dealt=applyDamage(hit.target,hit.amount,{source:hit.source,battle,category:'reflection',kind:hit.kind});
    battle.events.push({type:'reflection',kind:hit.kind,id:hit.target.id,sourceId:hit.source.id,amount:dealt.hpDamage+dealt.shieldDamage,...dealt});
  }
  // Explosions can cause further deaths, each resolved once. OUT is never death.
  const fallen=[];
  for(;;){
    const fresh=battle.units.filter(u=>u.hp<=0&&!u.eliminated&&!u.overflow&&!battle.resolvedDeaths.has(u.id));
    if(!fresh.length)break;
    for(const u of fresh){battle.resolvedDeaths.add(u.id);fallen.push(u);battle.events.push({type:'death',id:u.id});}
    for(const u of fresh){
      const killer=battle.units.find(v=>v.id===u.lastKillerId);
      for(const hit of [...(augments?.onDeath(u,killer)||[]),...(battle.controls?.onDeath(u)||[])]){
        const dealt=applyDamage(hit.target,hit.amount,{source:hit.source,battle,kind:hit.kind});
        battle.events.push({type:hit.kind,id:hit.target.id,sourceId:hit.source.id,amount:dealt.hpDamage+dealt.shieldDamage,...dealt});
      }
    }
  }
  traits.inherit(fallen);
}
