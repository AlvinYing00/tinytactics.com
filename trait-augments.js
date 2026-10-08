import {CLASS_IDS,CLASS_NAMES} from './class-rules.js';
import {ELEMENT_LABELS,teamTraits,CHAMPIONS} from './catalog.js';

const entries=[];
const add=(id,name,stages,type,description,effect,icon,requires=null)=>entries.push(Object.freeze({id,name,stages,type,description,effect,icon,requires}));
for(const role of CLASS_IDS){
  const name=CLASS_NAMES[role];
  add(`class-${role}`,name,[2,3],'class',`Your team counts as having +1 ${name}.`,{virtual:{[role]:1}},role);
  add(`class-${role}-chest`,`${name} Chest`,[4],'class',`+1 ${name} count. Gain a random ${name} champion costing up to 4 gold.`,{virtual:{[role]:1},gift:{maxCost:4,combatRole:role}},role);
}
for(const element of ['water','air','mountain','fire','electric','light','dark','ice','nature']){
  const name=ELEMENT_LABELS[element];
  add(`${element}-orb`,`${name} Orb`,[2],'trait',`Your team counts as having +1 ${name}.`,{virtual:{[element]:1}},element);
  add(`${element}-chest`,`${name} Chest`,[3],'trait',`+1 ${name} count. Gain a random ${name} champion costing up to 3 gold.`,{virtual:{[element]:1},gift:{maxCost:3,element}},element);
  const maxCost=element==='nature'?3:4;
  add(`${element}-chest-plus`,`${name} Chest PLUS`,[4],'trait',`+1 ${name} count. Gain a random ${name} champion costing up to ${maxCost} gold.`,{virtual:{[element]:1},gift:{maxCost,element}},element);
}
const special=(id,name,element,minimum,description,effect={})=>add(id,name,[4,5],'trait',description,{traitCombat:id,...effect},element,{element,minimum});
special('cosmic-orb','Cosmic Orb','cosmic',1,'Gain Asterion, the 5-cost Cosmic champion.',{gift:{type:'cosmic-5'}});
special('dragon-orb','Dragon Orb','cosmic',1,'Gain Dragonoid, the 6-cost Cosmic champion. Cosmic 3 can now reward additional copies.',{gift:{type:'cosmic-6'}});
special('universe-orb','Universe Orb','cosmic',1,'Gain Elyndra, the 7-cost Cosmic champion. Cosmic 3 can now reward additional copies.',{gift:{type:'cosmic-7'}});
special('cosmic-aura','Cosmic Aura','cosmic',1,'Cosmic champions in starting rows 1–2 gain 50% Attack. In rows 3–4, they gain 50% max HP.');
special('cosmic-wish','Cosmic Wish','cosmic',1,'Cosmic champions start at 50% HP and heal for 100% of their basic-attack damage dealt.');
special('water-spark','Water Spark','water',3,'Water basic attacks deal 100% extra damage.');
special('tidal-wave','Tidal Wave','water',10,'Tsunami sweeps enemies OUT even through Golden Shield and Anti-control.');
special('air-windfall','Air Windfall','air',1,'Each Air champion is guaranteed to earn 1 gold on every 5th basic attack.');
special('wind-assault','Wind Assault','air',10,'Air champions gain 50% basic-attack damage during their Wind Wall.');
special('mountain-rock','Mountain Rock','mountain',1,'Mountain champions gain 50% max HP.');
special('golden-reflection','Golden Reflection','mountain',6,'Mountain champions take no damage while Golden Shield is active.');
special('fire-cracker','Fire Cracker','fire',1,'Fire hits splash 50% attack damage to other enemies within 1 tile of the target. Splash does not apply Burn.');
special('million-meteors','Million Meteors','fire',7,'Meteor Rain continues all combat. Meteors fall 50% faster, landing in 2 seconds.');
special('electric-strike','Electric Strike','electric',3,'Every Electric basic attack shocks all enemies for 5% of the attacker’s Attack.');
special('double-inheritance','Double Inheritance','electric',3,'Double all HP and Attack gained through Electric inheritance.');
special('lighten-the-way','Lighten the way','light',2,'Light basic attacks deal 50% extra damage to stunned enemies.');
special('divine-squad','Divine Squad','light',2,'Light champions are immune to stun and fear and gain 50% attack speed.');
special('darken-the-world','Darken the world','dark',2,'Dark basic attacks deal 50% extra damage to feared enemies.');
special('suicide-squad','Suicide Squad','dark',6,'Dark death explosions reach 2 tiles and deal 50% of the fallen champion’s max HP instead of Attack.');
special('in-freeze','In Freeze','ice',3,'Ice basic attacks deal double damage to frozen enemies.');
special('xmas-gift','Xmas Gift','ice',3,'When an Ice champion kills an enemy, gain gold equal to that enemy’s cost, regardless of stars.');
special('nature-enhancement','Nature Enhancement','nature',2,'Double Nature’s per-second growth: 2% at Nature 2 and 4% at Nature 4.');
special('greener-and-greener','Greener and Greener','nature',4,'Every 5s, each living Nature champion summons another doppelganger with 25% of its current max HP and 50% Attack. Copies do not grow; no summon when tiles are full.');

export const TRAIT_AUGMENTS=Object.freeze(entries);
export function traitAugmentMatches(player,augment){
  const rule=augment.requires;if(!rule)return true;
  const traits=teamTraits(player.roster||[],CHAMPIONS,player.virtualTraits);
  const count=traits.counts[rule.element]||0;
  return rule.element==='air'?[1,4,8,10].includes(count)&&count>=rule.minimum:count>=rule.minimum;
}
