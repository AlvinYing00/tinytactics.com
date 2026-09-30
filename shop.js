import { SHOP_CHAMPIONS } from './catalog.js';

export const SHOP_SIZE = 5;
export const POOL_COPIES = Object.freeze({1:30,2:25,3:18,4:10,5:9});
// Future roster targets; bag capacities already apply to every current champion.
export const PLANNED_CHAMPION_COUNTS = Object.freeze({1:14,2:13,3:14,4:14,5:10});
export const PLANNED_POOL_TOTAL = Object.entries(PLANNED_CHAMPION_COUNTS).reduce((sum,[cost,count])=>sum+count*POOL_COPIES[cost],0);
const LEVEL_ODDS = Object.freeze([
  [100,0,0,0,0], [100,0,0,0,0], [75,25,0,0,0],
  [55,30,15,0,0], [45,33,20,2,0], [30,40,25,5,0],
  [16,30,43,10,1], [15,20,32,30,3], [10,17,25,33,15],
  [5,10,20,40,25], [1,2,12,50,35]
].map(Object.freeze));
const tiers=Array.from({length:5},(_,i)=>Object.values(SHOP_CHAMPIONS).filter(c=>c.cost===i+1));

export function shopOdds(level){
  if(!Number.isInteger(level)||level<1||level>11)throw new Error('Shop odds are available for levels 1 to 11.');
  return [...LEVEL_ODDS[level-1]];
}
export const ownedCopies = unit => 3**((unit.stars||1)-1);

// Derive reservations from persistent ownership, never from combat clones. This also
// returns sold cards and eliminated players' copies without a second mutable ledger.
export function availablePool(players=[],returnedShops=new Set()){
  const stock=new Map(Object.values(SHOP_CHAMPIONS).map(c=>[c.id,POOL_COPIES[c.cost]]));
  const subtract=(type,count)=>{if(stock.has(type))stock.set(type,stock.get(type)-count);};
  for(const player of players){
    if(player.hp<=0)continue;
    for(const unit of player.roster||[])subtract(unit.type,ownedCopies(unit));
    if(!returnedShops.has(player))for(const type of player.shop||[])if(type)subtract(type,1);
  }
  return stock;
}

// Select a cost first, then weight champion identities by their remaining copies.
// Reserving each draw immediately prevents the same last copy appearing twice.
export function drawChampion(cost,random=Math.random,excluded=new Set(),stock=availablePool()){
  const eligible=tiers[cost-1].filter(c=>!excluded.has(c.id)&&(stock.get(c.id)||0)>0);
  const total=eligible.reduce((sum,c)=>sum+stock.get(c.id),0);
  let roll=random()*total;
  if(!total)return null;
  for(const champion of eligible){
    roll-=stock.get(champion.id);
    if(roll<0){stock.set(champion.id,stock.get(champion.id)-1);return champion.id;}
  }
  return null;
}
export function rollShop(level,random=Math.random,excluded=new Set(),stock=availablePool()){
  const odds=shopOdds(level);
  return Array.from({length:SHOP_SIZE},()=>{
    const roll=random()*100;let sum=0,cost=0;
    for(;cost<4;cost++){sum+=odds[cost];if(roll<sum)break;}
    // Exhausted tiers stay empty rather than changing the advertised cost odds.
    return drawChampion(cost+1,random,excluded,stock);
  });
}
