// Combat membership is separate from catalog traits, so borrowed effects never
// contribute counts or create another team-wide opening event.
const FIRST_BREAKPOINT={fire:1,water:3,electric:3,air:1,mountain:1,nature:2,light:2,dark:2,ice:3,cosmic:1,crystal:2};
export const isSand=(unit,catalog)=>catalog[unit.type]?.element==='sand';
export function activeOrigins(rule){
  return Object.entries(FIRST_BREAKPOINT).filter(([origin,minimum])=>origin==='air'?[1,4,8,10].includes(rule.counts.air):(rule.counts[origin]||0)>=minimum).map(([origin])=>origin);
}
export function hasOrigin(unit,origin,catalog){
  if(!unit)return false;
  return isSand(unit,catalog)?(origin==='sand'||!unit.summoned&&!!unit.inheritedOrigins?.includes(origin)):catalog[unit.type]?.element===origin;
}
export function sandClasses(rule,rowClass){
  const roles=Object.entries(rule.classes).filter(([,bonus])=>bonus.tier>0).map(([role])=>role);
  if((rule.counts.cosmic||0)>=1&&rowClass)roles.push(rowClass);
  return [...new Set(roles)];
}
export function captureSandInheritance(battle,teams){
  for(const unit of battle.units){
    if(!isSand(unit,battle.catalog)||unit.summoned)continue;
    unit.inheritedOrigins=activeOrigins(teams[unit.team]);
    const row=unit.team==='ember'?battle.height/2-1-unit.y:unit.y-battle.height/2;
    unit.sandClass=['sentinel','duelist','assassin','ranger'][row];
    unit.inheritedClasses=sandClasses(teams[unit.team],unit.sandClass);
    unit.sandRange=row<2?1:3;
    const augments=battle.teamAugments[unit.team]||[];
    if(hasOrigin(unit,'mountain',battle.catalog)&&augments.includes('mountain-rock')){unit.maxHp*=1.5;unit.hp*=1.5;}
    if(hasOrigin(unit,'cosmic',battle.catalog)&&augments.includes('cosmic-aura')){
      if(row<2)unit.attackDamage*=1.5;else{unit.maxHp*=1.5;unit.hp*=1.5;}
    }
  }
}
