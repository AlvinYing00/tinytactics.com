import {Campaign,SHOP_SIZE} from './campaign.js';
import {CHAMPIONS,championStats,teamTraits} from './catalog.js';
import {chooseFormation} from './formation-ai.js';

export const BOT_STYLES=[
  {id:'leveler',name:'Aggressive leveling',element:'fire',class:'duelist'},
  {id:'economist',name:'Economy / interest',element:'water',class:'support'},
  {id:'reroller',name:'Reroll / 3-star hunting',element:'electric',class:'assassin'},
  {id:'vertical',name:'Trait vertical',element:'mountain',class:'sentinel'},
  {id:'hybrid',name:'Hybrid composition',element:'air',secondary:'water',class:'ranger'},
  {id:'flexible',name:'Flexible strongest-board',element:'electric',class:'duelist'},
  {id:'late',name:'High-cost late-game',element:'fire',class:'ranger'}
];
const deployed=u=>u.position.bench===undefined&&!u.overflow;
const clone=value=>JSON.parse(JSON.stringify(value));

// Reuse the same purchase/combination rules as the human. No free cards or gold.
export function planBot(league,player,opponent,{positionOnly=false}={}){
  const style=player.style,p=clone(player),difficulty=p.difficulty||'normal',easy=difficulty==='easy',strong=difficulty==='strong';
  const ctx=Object.create(Campaign.prototype);
  Object.assign(ctx,{players:{azure:opponent||{roster:[]},ember:p},mode:league.mode,phase:'preparation',round:league.round,random:league.random,nextId:league.nextId,levelCosts:league.levelCosts,botElement:style.element});
  const arrangeOverflow=()=>ctx.arrangeGifts(p.roster,new Set(p.roster.filter(u=>u.overflow).map(u=>u.id)));
  arrangeOverflow();
  // Only the shop system sees shared ownership; strategic scoring still uses scoutable units.
  ctx.poolPlayers=()=>Object.values(league.players).map(owner=>owner===player?p:owner);
  ctx.teamScore=units=>{
    const t=teamTraits(units.map(u=>({type:u.type}))),distinct=new Set(units.map(u=>u.type));
    const power=units.reduce((sum,u)=>{const c=championStats(u.type,u.stars);return sum+c.hp/500+c.damage/c.attackTicks/5;},0);
    const tiers=Object.values(t.classes).reduce((sum,c)=>sum+c.tier,0);
    const elements=(t.lightStacksRequired?12/t.lightStacksRequired:0)+t.lightControlResist*8+(t.darkFearEvery?10/t.darkFearEvery:0)+t.darkExplosionPercent*8+t.iceFreezePercent*15+(t.iceStorm?15:0)+t.natureGrowthPercent*45+(t.natureDoppelgangers?12:0)+t.burnPercent*65+t.healPercent*45+t.shieldPercent*6+t.reflectPercent*12+(t.inheritanceHpPercent+t.inheritanceAttackPercent)*22+t.coinChance*25+t.dodgeChance*16+(t.meteor?15:0)+(t.tsunami?25:0)+(t.thunder?15:0)+(t.windWall?15:0);
    const focus=Math.min(t.counts[style.element],{fire:7,water:10,mountain:6,electric:7,air:10,nature:4,light:8,dark:8,ice:10}[style.element]);
    const melee=units.filter(u=>['sentinel','duelist'].includes(CHAMPIONS[u.type].combatRole)).length;
    let preference=style.id==='vertical'?focus*7:style.id==='flexible'?0:focus*1.2;
    if(style.id!=='flexible')preference+=Math.min(6,t.counts[style.class])*.8;
    if(style.id==='hybrid')preference+=Math.min(t.counts[style.secondary],6)*1.5+tiers*.4;
    if(style.id==='reroller')preference+=units.reduce((sum,u)=>sum+(u.stars-1)*3+(CHAMPIONS[u.type].cost<=2?.5:0),0);
    if(style.id==='late')preference+=units.reduce((sum,u)=>sum+Math.max(0,CHAMPIONS[u.type].cost-3)*1.5,0);
    return power+elements+tiers*.65+preference+Math.min(melee,Math.ceil(units.length/3))*2-(units.length-distinct.size)*1.5;
  };
  if(!positionOnly){
    const urgent=p.hp<=(strong?45:30)||(strong&&p.lossStreak>=2),styleId=style.id;
    let reserve=urgent?0:styleId==='economist'?50:styleId==='late'?30:styleId==='reroller'?30:styleId==='hybrid'?20:styleId==='vertical'?10:styleId==='flexible'?10:0;
    if(easy)reserve=Math.floor(reserve*.6/10)*10;
    const mayLevel=()=>styleId!=='reroller'||p.level<5||p.roster.some(u=>u.stars===3)||league.stage>=4;
    const levelReserve=styleId==='leveler'?2:styleId==='late'?(p.level<8?10:30):reserve;
    const huntUpgrade=p.shop.some(type=>type&&p.roster.filter(u=>u.type===type&&u.stars===1).length>=2);
    const paysHP=ctx.levelCurrency('ember')==='HP';
    const levelNow=!strong||!huntUpgrade||paysHP||p.gold>=ctx.levelPrice('ember')+levelReserve+5;
    const canInvestInLevel=()=>ctx.canLevelUp('ember')&&(paysHP?p.hp-ctx.levelPrice('ember')>=(urgent?20:40):p.gold>=ctx.levelPrice('ember')+levelReserve);
    while(levelNow&&mayLevel()&&canInvestInLevel()){
      if(easy&&league.random()<.3)break;
      ctx.levelUp('ember');
    }
    const buyBest=()=>{
      const skipped=new Set();
      for(let attempt=0;attempt<SHOP_SIZE;attempt++){
        const before=ctx.teamScore(ctx.bestTeam());
        const choices=p.shop.map((type,slot)=>{
          if(!type||skipped.has(slot)||!ctx.canBuy(slot,'ember'))return null;
          const c=CHAMPIONS[type],copies=p.roster.filter(u=>u.type===type),plan=ctx.purchasePlan(type,'ember');
          const gain=ctx.teamScore(ctx.bestTeam(plan.roster))-before;
          const collecting=copies.length&&copies.some(deployed)&&copies.every(u=>u.stars<3);
          const copyBonus=collecting?(styleId==='reroller'&&c.cost<=2?3:1):0;
          const needs=p.roster.filter(deployed).length<p.level;
          const maySpend=urgent||needs||p.gold-c.cost>=reserve||gain>4;
          return maySpend&&gain+copyBonus>.05?{slot,gain:gain+copyBonus}:null;
        }).filter(Boolean).sort((a,b)=>b.gain-a.gain||a.slot-b.slot);
        if(!choices.length)break;
        if(easy&&league.random()<.25){skipped.add(choices[0].slot);continue;}
        ctx.buy(choices[0].slot,'ember');
      }
      const ids=new Set(ctx.bestTeam().map(u=>u.id));let bench=0;
      for(const u of p.roster.filter(u=>!u.overflow))u.position=ids.has(u.id)?{x:bench++%8,y:4+Math.floor((bench-1)/8)}:{bench:0};
      let slot=0;for(const u of [...p.roster].filter(u=>!u.overflow&&!ids.has(u.id))){
        const useful=p.roster.some(v=>ids.has(v.id)&&v.type===u.type&&v.stars<3);
        if(useful&&slot<6)u.position={bench:slot++};else ctx.sell(u.id,'ember');
      }
      arrangeOverflow();
    };
    buyBest();
    const styleRolls=styleId==='reroller'?8:urgent?5:styleId==='vertical'?3:styleId==='late'&&p.level>=8?5:2;
    const maxRolls=easy?Math.min(3,styleRolls):styleRolls+(strong&&urgent?2:0);
    for(let roll=0;roll<maxRolls&&p.gold>=ctx.refreshPrice('ember');roll++){
      const price=ctx.refreshPrice('ember');
      const lacks=p.roster.filter(deployed).length<p.level;
      if(price>0&&!lacks&&p.gold-price<reserve)break;
      if(price>0&&styleId==='economist'&&!urgent&&!lacks&&p.gold<50+price)break;
      ctx.refresh('ember');buyBest();
    }
  }
  const chosen=ctx.bestTeam(),ids=new Set(chosen.map(u=>u.id));let slot=0;
  for(const u of p.roster)if(!u.overflow&&!ids.has(u.id))u.position={bench:slot++};
  const formation=chooseFormation(chosen,opponent?.roster||[],{difficulty});
  const positions=new Map(formation.units.map(u=>[u.id,u.position]));
  for(const u of p.roster)if(positions.has(u.id))u.position=positions.get(u.id);
  arrangeOverflow();
  player.lastFormation=formation.decision;
  player.roster=p.roster.map(u=>({...u,team:player.team}));player.gold=p.gold;player.level=p.level;player.xp=p.xp;player.shop=p.shop;
  player.hp=p.hp;player.freeRerolls=p.freeRerolls;player.purchaseBoosts=p.purchaseBoosts;
  league.nextId=ctx.nextId;
}
