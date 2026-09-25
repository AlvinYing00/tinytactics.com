export const ELEMENTS=['fire','water','electric','air','mountain'];
export const ELEMENT_LABELS={fire:'Fire',water:'Water',electric:'Electric',air:'Air',mountain:'Mountain'};
export const ARCHETYPES=Object.freeze({
  sentinel:{name:'Sentinel',role:'Frontline',hp:250,damage:20,attackTicks:6,moveTicks:5,range:1,glyph:'S',description:'A sturdy shield for your backline. Holds the front and absorbs damage.'},
  ranger:{name:'Ranger',role:'Ranged',hp:150,damage:50,attackTicks:12,moveTicks:5,range:3,glyph:'R',description:'Strikes from three tiles away. Keep your Rangers behind the frontline.'},
  duelist:{name:'Duelist',role:'Skirmisher',hp:200,damage:35,attackTicks:8,moveTicks:3,range:1,glyph:'D',description:'Quick feet and faster blades. Closes the gap and attacks rapidly.'}
});
const names={
  fire:{sentinel:['Coalkeeper','Cinder Warden','Furnace Knight','Pyre Colossus'],ranger:['Spark Slinger','Ember Scout','Flare Archer','Sunfire Marksman'],duelist:['Ashblade','Cinder Fencer','Pyre Dancer','Inferno Reaver']},
  water:{sentinel:['Reef Keeper','Tide Warden','Coral Bastion','Abyss Bulwark'],ranger:['Brook Slinger','Current Scout','Riptide Archer','Deepwater Marksman'],duelist:['Foamblade','Tide Fencer','Torrent Dancer','Maelstrom Reaver']},
  electric:{sentinel:['Coil Keeper','Volt Warden','Arc Bastion','Thunder Bulwark'],ranger:['Static Slinger','Charge Scout','Flash Archer','Storm Marksman'],duelist:['Joltblade','Arc Fencer','Volt Dancer','Thunder Reaver']},
  air:{sentinel:['Gust Keeper','Breeze Warden','Cloud Bastion','Tempest Bulwark'],ranger:['Breeze Slinger','Gale Scout','Sky Archer','Tempest Marksman'],duelist:['Gustblade','Gale Fencer','Cyclone Dancer','Sky Reaver']},
  mountain:{sentinel:['Pebble Keeper','Granite Warden','Crag Bastion','Summit Colossus'],ranger:['Flint Slinger','Ridge Scout','Quartz Archer','Peak Marksman'],duelist:['Shaleblade','Slate Fencer','Obsidian Dancer','Avalanche Reaver']}
};
const legendary={fire:['Solkyr','ranger'],water:['Neruvia','ranger'],electric:['Voltrenne','duelist'],air:['Aeralune','ranger'],mountain:['Dolmarok','sentinel']};
const champions={};
// Entries are ordered by cost 1–5. Tankers use the Sentinel combat role.
const statLine=(hp,damage,seconds)=>Object.freeze({hp:Object.freeze(hp),damage:Object.freeze(damage),attackTicks:seconds*10});
export const ELEMENT_STATS=Object.freeze({
  fire:Object.freeze({
    sentinel:statLine([200,450,850,1200,2000],[25,50,75,100,150],2),
    duelist:statLine([150,350,600,850,1200],[50,75,110,150,210],1.5),
    ranger:statLine([100,250,400,650,800],[80,110,150,210,300],1)
  }),
  water:Object.freeze({
    sentinel:statLine([300,550,1050,1600,2500],[20,35,55,70,120],2),
    duelist:statLine([200,450,750,900,1500],[30,55,80,110,150],1.5),
    ranger:statLine([120,270,450,780,1000],[55,80,100,150,230],1)
  }),
  mountain:Object.freeze({
    sentinel:statLine([500,750,1300,2000,3500],[15,25,35,50,80],2),
    duelist:statLine([300,550,850,1200,2500],[20,40,60,80,100],1.5),
    ranger:statLine([200,400,650,950,1500],[40,60,80,120,150],1)
  }),
  electric:Object.freeze({
    sentinel:statLine([150,350,600,850,1250],[40,65,95,150,250],1.5),
    duelist:statLine([120,230,450,700,950],[80,100,150,230,350],1.25),
    ranger:statLine([80,150,270,450,650],[100,150,230,350,500],.8)
  }),
  air:Object.freeze({
    sentinel:statLine([250,500,750,1050,1600],[25,50,65,85,110],1.25),
    duelist:statLine([200,400,650,800,1300],[30,55,75,90,130],1),
    ranger:statLine([150,250,400,800,1200],[40,60,80,120,180],.5)
  })
});
function champion(id,name,element,combatRole,cost){
  const base=ARCHETYPES[combatRole],stats=ELEMENT_STATS[element][combatRole];
  champions[id]=Object.freeze({...base,id,name,element,combatRole,cost,sideTrait:cost===5?null:combatRole,traits:Object.freeze(cost===5?[element]:[element,combatRole]),hp:stats.hp[cost-1],damage:stats.damage[cost-1],attackTicks:stats.attackTicks,damageType:element==='electric'?'true':'physical',legendary:cost===5});
}
for(const element of ELEMENTS){
  for(const role of Object.keys(ARCHETYPES))names[element][role].forEach((name,index)=>champion(`${element}-${role}-${index+1}`,name,element,role,index+1));
  const [name,role]=legendary[element];champion(`${element}-legendary`,name,element,role,5);
}
export const CHAMPIONS=Object.freeze(champions);

// Stars add the same element and role's 1-cost HP/attack bonus.
export function championStats(type,stars=1,catalog=CHAMPIONS){
  const champion=catalog[type];
  if(!champion)throw new Error('Unknown champion.');
  if(!Number.isInteger(stars)||stars<1||stars>3)throw new Error('Stars must be between 1 and 3.');
  const first=ELEMENT_STATS[champion.element]?.[champion.combatRole];
  const base=first?{hp:first.hp[0],damage:first.damage[0]}:ARCHETYPES[champion.combatRole]||champion,bonus=[0,0,.25,.5][stars];
  return {...champion,hp:Math.round(champion.hp+base.hp*bonus),damage:Math.round(champion.damage+base.damage*bonus)};
}
export const sellValue = unit => CHAMPIONS[unit.type].cost * 3 ** ((unit.stars||1)-1);

// Distinct champion identities count; multiple copies of one champion count once.
export function teamTraits(units,catalog=CHAMPIONS){
  const counts=Object.fromEntries([...ELEMENTS,...Object.keys(ARCHETYPES)].map(t=>[t,0]));
  const unique=new Set();
  for(const u of units){if(unique.has(u.type))continue;unique.add(u.type);for(const trait of catalog[u.type]?.traits||[])counts[trait]++;}
  const fire=counts.fire,water=counts.water,mountain=counts.mountain,electric=counts.electric,air=counts.air;
  return {counts,burnPercent:fire>=8?.2:fire>=6?.15:fire>=4?.1:fire>=2?.05:0,
    healPercent:water>=9?.25:water>=6?.15:water>=3?.05:0,meteor:fire>=10,tsunami:water>=10,
    shieldPercent:mountain>=7?1:mountain>=5?.5:mountain>=3?.25:mountain>=1?.1:0,goldenShield:mountain>=9,
    electricPercent:electric>=9?.2:electric>=6?.1:electric>=3?.05:0,thunder:electric>=10,
    coinChance:air>=4?.5:air>=1?.25:0,windWall:air>=10};
}
