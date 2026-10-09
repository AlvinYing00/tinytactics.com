import {CHAMPIONS,ELEMENTS} from './catalog.js';

export function championMatchesFilters(champion,{element='all',role='all',cost='all'}={}){
  return (element==='all'||champion.element===element)&&(role==='all'||champion.combatRole===role)&&(cost==='all'||champion.cost===Number(cost));
}
export function augmentElements(augment){
  const e=augment.effect||{};
  return [...new Set([augment.requires?.element,e.gift?.element,e.filter?.element,CHAMPIONS[e.gift?.type]?.element,augment.icon,...Object.keys(e.virtual||{})].filter(value=>ELEMENTS.includes(value)))];
}
export function augmentMatchesFilters(augment,{type='all',element='all',query=''}={}){
  const elements=augmentElements(augment),text=query.trim().toLowerCase();
  return (type==='all'||augment.type===type)&&(element==='all'||(element==='general'?!elements.length:elements.includes(element)))&&(!text||`${augment.name} ${augment.description}`.toLowerCase().includes(text));
}
