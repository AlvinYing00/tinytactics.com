export const CLASS_IDS=['sentinel','duelist','ranger','support','assassin'];
export const CLASS_NAMES={sentinel:'Tanker',duelist:'Duelist',ranger:'Ranger',support:'Support',assassin:'Assassin'};
export const classTier=count=>count>=6?6:count>=4?4:count>=2?2:0;
export const hasClass=(unit,role,catalog)=>!!catalog[unit.type]?.traits?.includes(role);
export function classBonuses(counts){
  const tier=Object.fromEntries(CLASS_IDS.map(role=>[role,classTier(counts[role]||0)]));
  return {
    sentinel:{tier:tier.sentinel,reduction:({2:.1,4:.2,6:.3})[tier.sentinel]||0},
    duelist:{tier:tier.duelist,perAttack:({2:.03,4:.04,6:.05})[tier.duelist]||0,cap:({2:.15,4:.3,6:.5})[tier.duelist]||0},
    ranger:{tier:tier.ranger,damageBonus:({2:.1,4:.2,6:.35})[tier.ranger]||0,rangeBonus:tier.ranger===6?1:0},
    support:{tier:tier.support,targets:({2:1,4:2,6:3})[tier.support]||0,healPercent:({2:.05,4:.075,6:.1})[tier.support]||0,shieldPercent:tier.support===6?.05:0},
    assassin:{tier:tier.assassin,damageBonus:({2:.15,4:.3,6:.5})[tier.assassin]||0,dodgeChance:({4:.1,6:.2})[tier.assassin]||0,shieldBypass:tier.assassin===6?.25:0}
  };
}
