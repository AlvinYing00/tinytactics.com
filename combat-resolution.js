// All committed attacks resolve even if their source dies during this tick.
// Damage categories stay separate so shield damage and trait damage never reflect.
export function applyDamage(target,amount,{source,execute=false}={}){
  if(target.hp<=0)return {hpDamage:0,shieldDamage:0};
  const before=target.hp;
  const shieldDamage=execute?0:Math.min(target.shield,amount);
  target.shield-=shieldDamage;
  target.hp=execute?0:Math.max(0,target.hp-(amount-shieldDamage));
  const hpDamage=before-target.hp;
  if(source){source.damageDealt+=hpDamage+shieldDamage;if(target.hp===0)source.kills++;}
  return {hpDamage,shieldDamage};
}

export function resolveCombat(battle,hits){
  const traits=battle.traits,alive=battle.living(),healing=new Map(),reflections=[];
  for(const hit of hits){
    const heal=traits.onAttack(hit.attacker,hit.target,hit.dodged);
    if(heal)healing.set(hit.attacker.id,(healing.get(hit.attacker.id)||0)+heal);
  }
  for(const u of alive){
    const restored=Math.min(u.maxHp-u.hp,healing.get(u.id)||0);u.hp+=restored;
    if(restored)battle.events.push({type:'heal',id:u.id,amount:restored});
  }
  // Stable attacker order defines shield/HP allocation when several hits coincide.
  for(const {attacker,target,amount,critical,dodged} of hits){
    const dealt=applyDamage(target,amount,{source:attacker});
    battle.events.push({type:'attack',id:attacker.id,targetId:target.id,amount,critical,dodged,damageType:attacker.damageType,...dealt});
    const reflected=traits.reflection(target,dealt.hpDamage);
    if(reflected)reflections.push({source:target,target:attacker,amount:reflected});
  }
  // Thunder execution is checked against HP immediately before its damage lands.
  for(const effect of traits.damageIntents()){
    const target=battle.units.find(u=>u.id===effect.targetId);if(!target||target.hp<=0)continue;
    const source=battle.units.find(u=>u.id===effect.sourceId);
    const execute=effect.executeBelow!==undefined&&target.hp<target.maxHp*effect.executeBelow;
    applyDamage(target,effect.amount,{source,execute});
    if(execute)target.eliminatedBy=effect.kind;
    battle.events.push({type:effect.kind,id:target.id,amount:effect.amount,execute});
  }
  for(const hit of reflections){
    applyDamage(hit.target,hit.amount,{source:hit.source});
    battle.events.push({type:'reflection',id:hit.target.id,sourceId:hit.source.id,amount:hit.amount});
  }
  const fallen=alive.filter(u=>u.hp<=0);
  for(const u of fallen)battle.events.push({type:'death',id:u.id});
  traits.inherit(fallen);
}
