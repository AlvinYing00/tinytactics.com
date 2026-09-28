import {CLASS_IDS,classBonuses} from './class-rules.js';
export const ELEMENTS=['fire','water','electric','air','mountain'];
export const ELEMENT_LABELS={fire:'Fire',water:'Water',electric:'Electric',air:'Air',mountain:'Mountain'};
export const ARCHETYPES=Object.freeze({
  sentinel:{name:'Tanker',role:'Frontline',hp:250,damage:20,attackTicks:6,moveTicks:5,range:1,glyph:'S',description:'Holds the frontline and absorbs champion attacks.'},
  ranger:{name:'Ranger',role:'Ranged',hp:150,damage:50,attackTicks:12,moveTicks:5,range:3,glyph:'R',description:'Strikes from three tiles away. Keep your Rangers behind the frontline.'},
  duelist:{name:'Duelist',role:'Skirmisher',hp:200,damage:35,attackTicks:8,moveTicks:3,range:1,glyph:'D',description:'Quick feet and faster blades. Closes the gap and attacks rapidly.'},
  support:{name:'Support',role:'Backline utility',hp:180,damage:18,attackTicks:17.5,moveTicks:5,range:3,glyph:'+',description:'Attacks from the backline. Support traits heal and protect the team every five seconds.'},
  assassin:{name:'Assassin',role:'Backline hunter',hp:150,damage:70,attackTicks:12.5,moveTicks:3,range:1,glyph:'A',description:'Attempts one opening jump toward Rangers and Supports. Wind Wall blocks crossing; blocked jumps never retry.'}
});
const names={
  fire:{sentinel:['Coalkeeper','Cinder Warden','Furnace Knight','Pyre Colossus'],ranger:['Spark Slinger','Ember Scout','Flare Archer','Sunfire Marksman'],duelist:['Ashblade','Cinder Fencer','Pyre Dancer','Inferno Reaver']},
  water:{sentinel:['Reef Keeper','Tide Warden','Coral Bastion','Abyss Bulwark'],ranger:['Brook Slinger','Current Scout','Riptide Archer','Deepwater Marksman'],duelist:['Foamblade','Tide Fencer','Torrent Dancer','Maelstrom Reaver']},
  electric:{sentinel:['Coil Keeper','Volt Warden','Arc Bastion','Thunder Bulwark'],ranger:['Static Slinger','Charge Scout','Flash Archer','Storm Marksman'],duelist:['Joltblade','Arc Fencer','Volt Dancer','Thunder Reaver']},
  air:{sentinel:['Gust Keeper','Breeze Warden','Cloud Bastion','Tempest Bulwark'],ranger:['Breeze Slinger','Gale Scout','Sky Archer','Tempest Marksman'],duelist:['Gustblade','Gale Fencer','Cyclone Dancer','Sky Reaver']},
  mountain:{sentinel:['Pebble Keeper','Granite Warden','Crag Bastion','Summit Colossus'],ranger:['Flint Slinger','Ridge Scout','Quartz Archer','Peak Marksman'],duelist:['Shaleblade','Slate Fencer','Obsidian Dancer','Avalanche Reaver']}
};
const legendary={fire:['Solkyr','ranger'],water:['Neruvia','ranger'],electric:['Voltrenne','duelist'],air:['Aeralune','ranger'],mountain:['Dolmarok','sentinel']};
const newRoleNames={
  fire:{support:['Ember Tender','Cinder Oracle','Flame Cantor','Dawn Hierophant'],assassin:['Coal Stalker','Cinder Fang','Pyre Shade','Infernal Reaper']},
  water:{support:['Spring Tender','Tide Oracle','Coral Cantor','Ocean Hierophant'],assassin:['Mist Stalker','Tide Fang','Abyss Shade','Undertow Reaper']},
  mountain:{support:['Moss Tender','Stone Oracle','Crystal Cantor','Peak Hierophant'],assassin:['Gravel Stalker','Obsidian Fang','Crag Shade','Faultline Reaper']},
  electric:{support:['Charge Tender','Pulse Oracle','Arc Cantor','Storm Hierophant'],assassin:['Spark Stalker','Volt Fang','Arc Shade','Thunder Reaper']},
  air:{support:['Breeze Tender','Gale Oracle','Cloud Cantor','Sky Hierophant'],assassin:['Zephyr Stalker','Gale Fang','Cloud Shade','Tempest Reaper']}
};
for(const element of ELEMENTS)Object.assign(names[element],newRoleNames[element]);
const champions={};
// Entries are ordered by cost 1–5. Tankers use the Sentinel combat role.
const statLine=(hp,damage,seconds)=>Object.freeze({hp:Object.freeze(hp),damage:Object.freeze(damage),attackTicks:seconds*10});
export const ELEMENT_STATS=Object.freeze({
  fire:Object.freeze({
    sentinel:statLine([200,450,850,1200,2000],[25,50,75,100,150],2),
    duelist:statLine([150,350,600,850,1200],[50,75,110,150,210],1.5),
    ranger:statLine([100,250,400,650,800],[80,110,150,210,300],1),
    support:statLine([130,300,500,750,1000],[25,40,60,85,120],1.75),
    assassin:statLine([120,280,450,700,950],[95,130,180,250,360],1.25)
  }),
  water:Object.freeze({
    sentinel:statLine([300,550,1050,1600,2500],[20,35,55,70,120],2),
    duelist:statLine([200,450,750,900,1500],[30,55,80,110,150],1.5),
    ranger:statLine([120,270,450,780,1000],[55,80,100,150,230],1),
    support:statLine([180,380,650,850,1300],[18,35,50,75,110],1.75),
    assassin:statLine([150,330,550,820,1200],[70,95,130,190,280],1.25)
  }),
  mountain:Object.freeze({
    sentinel:statLine([500,750,1300,2000,3500],[15,25,35,50,80],2),
    duelist:statLine([300,550,850,1200,2500],[20,40,60,80,100],1.5),
    ranger:statLine([200,400,650,950,1500],[40,60,80,120,150],1),
    support:statLine([280,500,800,1150,2200],[15,30,45,65,90],1.75),
    assassin:statLine([230,450,720,1050,1800],[50,75,105,150,210],1.25)
  }),
  electric:Object.freeze({
    sentinel:statLine([150,350,600,850,1250],[40,65,95,150,250],1.5),
    duelist:statLine([120,230,450,700,950],[80,100,150,230,350],1.25),
    ranger:statLine([80,150,270,450,650],[100,150,230,350,500],.8),
    support:statLine([100,200,380,600,850],[45,70,105,165,250],1.25),
    assassin:statLine([90,180,320,520,750],[130,190,290,430,650],1)
  }),
  air:Object.freeze({
    sentinel:statLine([250,500,750,1050,1600],[25,50,65,85,110],1.25),
    duelist:statLine([200,400,650,800,1300],[30,55,75,90,130],1),
    ranger:statLine([150,250,400,800,1200],[40,60,80,120,180],.5),
    support:statLine([170,330,550,750,1150],[20,40,55,75,105],1),
    assassin:statLine([160,300,500,750,1100],[55,80,110,165,250],.75)
  })
});
function champion(id,name,element,combatRole,cost){
  const base=ARCHETYPES[combatRole],stats=ELEMENT_STATS[element][combatRole];
  champions[id]=Object.freeze({...base,id,name,element,combatRole,cost,sideTrait:combatRole,traits:Object.freeze([element,combatRole]),hp:stats.hp[cost-1],damage:stats.damage[cost-1],attackTicks:stats.attackTicks,damageType:element==='electric'?'true':'physical',legendary:cost===5});
}
for(const element of ELEMENTS){
  for(const role of Object.keys(ARCHETYPES))names[element][role].forEach((name,index)=>champion(`${element}-${role}-${index+1}`,name,element,role,index+1));
  const [name,role]=legendary[element];champion(`${element}-legendary`,name,element,role,5);
}
export const CHAMPIONS=Object.freeze(champions);
// Every element offers all five roles at costs 1–4 and its existing 5-cost legendary.
export const SHOP_CHAMPIONS=CHAMPIONS;
export function virtualTraitCounts(input={}){
  const counts=Object.fromEntries(ELEMENTS.map(element=>[element,0]));
  for(const [element,count] of Object.entries(input)){
    if(!ELEMENTS.includes(element)||!Number.isInteger(count)||count<0)throw new Error('Virtual trait counts must be non-negative whole numbers for an element.');
    counts[element]=count;
  }
  return counts;
}

// Each star tier scales this champion's own 1-star stats, never the previous tier.
export function championStats(type,stars=1,catalog=CHAMPIONS){
  const champion=catalog[type];
  if(!champion)throw new Error('Unknown champion.');
  if(!Number.isInteger(stars)||stars<1||stars>3)throw new Error('Stars must be between 1 and 3.');
  const hpMultiplier=[0,1,1.75,3][stars],attackMultiplier=[0,1,1.5,2.25][stars];
  return {...champion,hp:Math.round(champion.hp*hpMultiplier),damage:Math.round(champion.damage*attackMultiplier)};
}
export const sellValue = unit => CHAMPIONS[unit.type].cost * 3 ** ((unit.stars||1)-1);

// Distinct champion identities count; multiple copies of one champion count once.
export function teamTraits(units,catalog=CHAMPIONS,virtual={}){
  const counts=Object.fromEntries([...ELEMENTS,...CLASS_IDS].map(t=>[t,0]));
  const unique=new Set();
  for(const u of units){if(u.position?.bench!==undefined||unique.has(u.type))continue;unique.add(u.type);for(const trait of catalog[u.type]?.traits||[])counts[trait]++;}
  const boardCounts={...counts},virtualCounts=virtualTraitCounts(virtual);
  for(const element of ELEMENTS)counts[element]+=virtualCounts[element];
  const fire=counts.fire,water=counts.water,mountain=counts.mountain,electric=counts.electric,air=counts.air;
  return {counts,boardCounts,virtualCounts,classes:classBonuses(boardCounts),burnPercent:fire>=5?.1:fire>=3?.07:fire>=1?.05:0,
    healPercent:water>=9?.25:water>=6?.15:water>=3?.05:0,meteor:fire>=7,tsunami:water>=10,
    shieldPercent:mountain>=6?1:mountain>=4?.5:mountain>=2?.25:mountain>=1?.1:0,goldenShield:mountain>=6,
    reflectPercent:mountain>=6?.3:mountain>=4?.2:mountain>=2?.1:0,
    inheritanceHpPercent:electric>=7?.25:electric>=5?.1:electric>=3?.05:0,
    inheritanceAttackPercent:electric>=7?.15:electric>=5?.1:electric>=3?.05:0,thunder:electric>=7,
    coinChance:air===1?.05:air===4?.075:air===8?.1:air===10?.15:0,
    dodgeChance:air===4?.05:air===8?.1:air===10?.15:0,criticalEvery:air===4?10:air===8?8:air===10?5:0,
    criticalMultiplier:air===4?2:air===8?2.5:air===10?3:1,windWall:air===10,windPiercePercent:air===10?.5:0};
}
