import { Battle } from './engine.js';
import { CHAMPIONS, teamTraits, championStats, sellValue } from './catalog.js';
import { combineCopies } from './combinations.js';
import { SHOP_SIZE, rollShop, availablePool, drawChampion } from './shop.js';
import {maxLevel,levelCurrency,hasAugment,refreshPrice,freeRoundRerolls} from './augments.js';
export { SHOP_SIZE, shopOdds, rollShop } from './shop.js';

export const LEVEL_COSTS = Object.freeze({3:10,4:20,5:30,6:40,7:55,8:65,9:80});
export const BENCH_SIZE = 9;
export const stageDamage = stage => Math.min(6,stage+1);
export const streakBonus = losses => losses>=5?3:losses===4?2:losses===3?1:0;
const onBoard = u => u.position.bench===undefined&&!u.overflow;
const samePosition = (a,b) => a.bench!==undefined ? a.bench===b.bench : b.bench===undefined&&a.x===b.x&&a.y===b.y;
const traitScore=t=>t.burnPercent*70+t.healPercent*50+t.shieldPercent*6+t.reflectPercent*15+(t.inheritanceHpPercent+t.inheritanceAttackPercent)*25+t.coinChance*30+t.dodgeChance*20+(t.criticalEvery?12/t.criticalEvery:0)+(t.meteor?15:0)+(t.tsunami?25:0)+(t.goldenShield?6:0)+(t.thunder?15:0)+(t.windWall?15:0)+t.classes.sentinel.reduction*10+t.classes.duelist.cap*6+t.classes.ranger.damageBonus*8+t.classes.ranger.rangeBonus*2+t.classes.support.targets*t.classes.support.healPercent*12+t.classes.support.shieldPercent*20+t.classes.assassin.damageBonus*6+t.classes.assassin.dodgeChance*6+t.classes.assassin.shieldBypass*4;

// Owned champions and economy survive rounds; Battle holds only combat state.
export class Campaign {
  constructor({random=Math.random,initialize=true}={}) {
    this.random=random;this.round=1;this.phase='preparation';this.nextId=1;this.result=null;
    this.players={};
    if(!initialize)return;
    for(const team of ['azure','ember'])this.players[team]={team,hp:100,gold:10,level:3,xp:0,lossStreak:0,virtualTraits:{},roster:[],shop:[],shopLocked:false,retainShop:false,lastIncome:null};
    this.refreshRoundShops();
    this.botElement=random()<.5?'fire':'water';
    this.prepareBot();this.rebuildBattle();
  }
  get stage(){return Math.floor((this.round-1)/7)+1;}
  get roundLabel(){return `${this.stage}-${(this.round-1)%7+1}`;}
  get player(){return this.players.azure;}
  get opponent(){return this.players.ember;}
  editable(){if(this.phase!=='preparation')throw new Error('Make purchases and formation changes between battles.');}
  canTrade(){return this.phase==='preparation';}
  economyEditable(){this.editable();}
  deployed(team='azure'){return this.players[team].roster.filter(onBoard);}
  bench(team='azure'){return this.players[team].roster.filter(u=>u.position.bench!==undefined);}
  overflow(team='azure'){return this.players[team].roster.filter(u=>u.overflow);}
  traits(team='azure'){return teamTraits(this.deployed(team),CHAMPIONS,this.players[team].virtualTraits);}
  maxedTypes(team='azure'){return new Set(this.players[team].roster.filter(u=>u.stars===3).map(u=>u.type));}
  poolPlayers(){return Object.values(this.players);}
  poolStock(returnedShops=new Set()){return availablePool(this.poolPlayers(),returnedShops);}
  rollOffers(team='azure'){
    const p=this.players[team];
    p.shop=rollShop(p.level,this.random,this.maxedTypes(team),this.poolStock(new Set([p])));
    return p.shop;
  }
  refreshRoundShops(){
    const players=Object.values(this.players).filter(p=>p.hp>0);
    // Return all unlocked offers before drawing any new round's offers.
    for(const p of players)if(!p.retainShop)p.shop=[];
    for(const p of players){if(!p.retainShop)this.rollOffers(p.team);p.retainShop=false;}
  }
  freeBench(team){const used=new Set(this.bench(team).map(u=>u.position.bench));return Array.from({length:BENCH_SIZE},(_,i)=>i).find(i=>!used.has(i));}
  maxLevel(team='azure'){return maxLevel(this.players[team]);}
  levelCurrency(team='azure'){return levelCurrency(this.players[team]);}
  xpRequired(team='azure'){const p=this.players[team];return (this.levelCosts||LEVEL_COSTS)[p.level]??(p.level===10?76:0);}
  refreshPrice(team='azure'){return refreshPrice(this,this.players[team]);}
  canLevelUp(team='azure'){
    const p=this.players[team],cost=this.levelPrice(team);return p.level<this.maxLevel(team)&&(this.levelCurrency(team)==='HP'?p.hp>cost:p.gold>=cost);
  }
  arrangeGifts(roster,newIds){
    const used=new Set(roster.filter(u=>!newIds.has(u.id)&&u.position.bench!==undefined).map(u=>u.position.bench));
    const occupied=new Set(roster.filter(u=>!newIds.has(u.id)&&u.position.bench===undefined).map(u=>`${u.position.x},${u.position.y}`));
    for(const u of roster.filter(u=>newIds.has(u.id))){
      const slot=Array.from({length:BENCH_SIZE},(_,i)=>i).find(i=>!used.has(i));
      if(slot!==undefined){u.position={bench:slot};delete u.overflow;used.add(slot);}
      else{const tile=[7,6,5,4].flatMap(y=>Array.from({length:8},(_,x)=>({x,y}))).find(t=>!occupied.has(`${t.x},${t.y}`));
        if(!tile)throw new Error('Make room for the gifted champions first.');u.position=tile;u.overflow=true;occupied.add(`${tile.x},${tile.y}`);}
    }
    return roster;
  }
  giftChampion(team,{type,cost,element,combatRole}){
    const p=this.players[team];
    if(!type){
      const choices=Object.values(CHAMPIONS).filter(c=>c.cost===cost&&(!element||c.element===element)&&(!combatRole||c.combatRole===combatRole));
      const nonMax=choices.filter(c=>!this.maxedTypes(team).has(c.id)),eligible=nonMax.length?nonMax:choices;
      type=eligible[Math.min(eligible.length-1,Math.floor(this.random()*eligible.length))]?.id;
    }
    if(!CHAMPIONS[type])throw new Error('No champion matches this gift.');
    // Augment gifts are generated copies: they neither need nor reserve bag stock.
    const id=this.nextId++,unit={id,type,team:p.team,stars:1,poolCopies:0,position:{bench:BENCH_SIZE},overflow:true};
    const plan=combineCopies([...p.roster,unit],type,id);p.roster=this.arrangeGifts(plan.roster,new Set([id]));
    this.replaceMaxedOffers(team);this.rebuildBattle();return p.roster.find(u=>u.id===plan.unit.id);
  }
  sellOverflow(team){
    const p=this.players[team],sold=this.overflow(team);p.gold+=sold.reduce((n,u)=>n+sellValue(u),0);p.roster=p.roster.filter(u=>!u.overflow);return sold;
  }
  purchasePlan(type,team='azure'){
    const p=this.players[team],boost=p.purchaseBoosts?.[CHAMPIONS[type].cost],count=boost?.count||1,stars=boost?.stars||1;
    // Only the purchased card comes from the shop. Every bonus copy is gifted.
    const candidates=Array.from({length:count},(_,i)=>({id:this.nextId+i,type,team:p.team,stars,...(boost?{poolCopies:i===0?1:0,overflow:true}:{}),position:{bench:(this.freeBench(team)??BENCH_SIZE)+i}}));
    const plan=combineCopies([...p.roster,...candidates],type,candidates[0].id);plan.added=count;plan.boost=boost;
    if(boost)this.arrangeGifts(plan.roster,new Set(candidates.map(u=>u.id)));
    return plan;
  }
  canBuy(slot,team='azure'){
    const p=this.players[team],type=p.shop[slot];
    return this.canTrade()&&!!type&&!this.maxedTypes(team).has(type)&&p.gold>=CHAMPIONS[type].cost&&this.purchasePlan(type,team).roster.filter(u=>u.position.bench!==undefined).length<=BENCH_SIZE;
  }
  buy(slot,team='azure') {
    this.economyEditable();const p=this.players[team];
    if(!Number.isInteger(slot)||slot<0||slot>=SHOP_SIZE||!p.shop[slot])throw new Error('That shop card is no longer available.');
    const type=p.shop[slot],champion=CHAMPIONS[type];
    if(this.maxedTypes(team).has(type))throw new Error(`${champion.name} is already at 3 stars.`);
    if(p.gold<champion.cost)throw new Error(`You need ${champion.cost} gold to recruit ${champion.name}.`);
    const plan=this.purchasePlan(type,team);
    if(plan.roster.filter(u=>u.position.bench!==undefined).length>BENCH_SIZE)throw new Error('Your bench is full. Deploy, combine or sell a champion first.');
    const existing=new Map(p.roster.map(u=>[u.id,u]));
    p.roster=plan.roster.map(u=>{const old=existing.get(u.id);if(old){Object.assign(old,u);return old;}return u;});
    this.nextId+=plan.added;p.gold-=champion.cost;p.shop[slot]=null;
    if(plan.boost)delete p.purchaseBoosts[champion.cost];
    this.replaceMaxedOffers(team);
    if(team==='azure')this.rebuildBattle();
    return p.roster.find(u=>u.id===plan.unit.id);
  }
  replaceMaxedOffers(team){
    const p=this.players[team];
    if(this.maxedTypes(team).size){
      const excluded=this.maxedTypes(team);
      // Return forbidden reservations together before drawing same-cost replacements.
      const replacements=p.shop.map((offer,slot)=>offer&&excluded.has(offer)?{slot,cost:CHAMPIONS[offer].cost}:null).filter(Boolean);
      for(const {slot} of replacements)p.shop[slot]=null;
      const stock=this.poolStock();
      for(const {slot,cost} of replacements)p.shop[slot]=drawChampion(cost,this.random,excluded,stock);
    }
  }
  refresh(team='azure') {
    this.economyEditable();const p=this.players[team];
    const price=this.refreshPrice(team);if(p.gold<price)throw new Error('You need 2 gold to refresh the shop.');
    p.gold-=price;if(price===0&&!freeRoundRerolls(this,p))p.freeRerolls--;this.rollOffers(team);return price;
  }
  setShopLocked(locked,team='azure'){
    this.economyEditable();
    if(typeof locked!=='boolean')throw new Error('Choose whether to lock the shop.');
    this.players[team].shopLocked=locked;return locked;
  }
  levelUp(team='azure') {
    this.editable();const p=this.players[team],cost=this.levelPrice(team);
    if(p.level>=this.maxLevel(team))throw new Error(`Level ${this.maxLevel(team)} is the maximum level.`);
    const currency=this.levelCurrency(team);
    if(!this.canLevelUp(team))throw new Error(currency==='HP'?'This level-up would leave you with no HP.':`You need ${cost} gold to reach level ${p.level+1}.`);
    if(currency==='HP')p.hp-=cost;else p.gold-=cost;p.level++;p.xp=0;return p.level;
  }
  levelPrice(team='azure'){
    const p=this.players[team],rate=hasAugment(p,'death-contract')?.75:hasAugment(p,'level-discount')?.75:1;return p.level<this.maxLevel(team)?Math.max(0,this.xpRequired(team)-p.xp)*rate:0;
  }
  gainExperience(team,amount){
    const p=this.players[team],before=p.level;
    const cap=this.maxLevel(team);if(p.level>=cap)return {gained:0,levels:0,level:p.level,xp:0};
    p.xp+=amount;
    while(p.level<cap&&p.xp>=this.xpRequired(team)){p.xp-=this.xpRequired(team);p.level++;}
    if(p.level===cap)p.xp=0;
    return {gained:amount,levels:p.level-before,level:p.level,xp:p.xp};
  }
  movementEditable(){this.editable();}
  move(id,target) {
    const p=this.player,u=p.roster.find(v=>v.id===id);this.movementEditable(u,target);
    if(!u)throw new Error('Select one of your champions.');
    const toBench=target.bench!==undefined;
    if(toBench){if(!Number.isInteger(target.bench)||target.bench<0||target.bench>=BENCH_SIZE)throw new Error('Choose a bench slot.');}
    else if(!Number.isInteger(target.x)||!Number.isInteger(target.y)||target.x<0||target.x>7||target.y<4||target.y>7)throw new Error('Deploy in your lower four rows.');
    const other=p.roster.find(v=>samePosition(v.position,target));
    if(other===u)return null;
    if((u.overflow||other?.overflow)&&other)throw new Error('Move an overflow gift to an empty bench slot or an open deployment slot.');
    if(!toBench&&!onBoard(u)&&!other&&this.deployed().length>=p.level)throw new Error(`Level ${p.level} allows ${p.level} champions. Swap with a teammate or level up.`);
    const origin={...u.position};u.position=toBench?{bench:target.bench}:{x:target.x,y:target.y};
    delete u.overflow;
    if(other)other.position=origin;
    this.rebuildBattle();return other||null;
  }
  canSell(id,team='azure') {
    const unit=this.players[team]?.roster.find(u=>u.id===id);
    return !!unit&&this.canTrade()&&(this.phase==='preparation'||unit.position.bench!==undefined);
  }
  sell(id,team='azure') {
    this.economyEditable();const p=this.players[team],index=p.roster.findIndex(u=>u.id===id);
    if(index<0)throw new Error('Select one of your champions.');
    if(!this.canSell(id,team))throw new Error('Only bench champions can be sold while a round is underway.');
    const [u]=p.roster.splice(index,1);p.gold+=sellValue(u);
    if(team==='azure')this.rebuildBattle();return u;
  }
  rebuildBattle() {
    this.battle=new Battle({cap:10,seed:this.round*2654435761,traitCounts:Object.fromEntries(Object.entries(this.players).map(([team,p])=>[team,p.virtualTraits])),onGold:(team,amount)=>{this.players[team].gold+=amount;}});
    for(const team of ['azure','ember'])for(const owned of this.deployed(team)) {
      const unit=this.battle.place(owned.type,team,owned.position.x,owned.position.y,owned.stars||1);unit.id=owned.id;
    }
    this.battle.nextId=this.nextId;
  }
  start() {
    this.editable();
    this.lastAutoDeployed=this.autoDeploy();this.rebuildBattle();
    if(!this.deployed().length){this.battle.phase='finished';this.battle.outcome='ember';this.phase='combat';return;}
    this.battle.start();this.phase='combat';
  }
  settle() {
    if(this.result)return this.result;
    if(this.phase!=='combat'||this.battle.phase!=='finished')throw new Error('The battle is still in progress.');
    const outcome=this.battle.outcome,damage=outcome==='draw'?0:stageDamage(this.stage);
    const loser=outcome==='azure'?'ember':outcome==='ember'?'azure':null;
    if(loser)this.players[loser].hp=Math.max(0,this.players[loser].hp-damage);
    const income={},experience={};
    for(const team of ['azure','ember']) {
      const p=this.players[team];p.lossStreak=loser===team?p.lossStreak+1:0;
      // Interest is locked from held gold before any round rewards are added.
      const parts={base:5,interest:Math.min(5,Math.floor(p.gold/10)),win:outcome===team?1:0,streak:streakBonus(p.lossStreak)};
      parts.total=parts.base+parts.interest+parts.win+parts.streak;
      p.gold+=parts.total;p.lastIncome=parts;income[team]=parts;
      experience[team]=this.gainExperience(team,2);
      // Consume the lock once at round end; keep these offers through the next refresh.
      p.retainShop=p.shopLocked;p.shopLocked=false;
    }
    this.phase=Object.values(this.players).some(p=>p.hp===0)?'finished':'result';
    this.result={round:this.roundLabel,outcome,loser,damage,income,experience,airGold:{...this.battle.goldEarned},matchOver:this.phase==='finished'};
    return this.result;
  }
  nextRound() {
    if(this.phase!=='result')throw new Error(this.phase==='finished'?'The match is over. Start a new match.':'Finish this round first.');
    this.round++;this.result=null;this.phase='preparation';
    this.refreshRoundShops();
    this.prepareBot();this.rebuildBattle();
  }
  autoDeploy(team='azure'){
    this.editable();const added=[],p=this.players[team];
    while(this.deployed(team).length<p.level&&this.bench(team).length){
      const deployed=this.deployed(team),traits=this.traits(team),types=new Set(deployed.map(u=>u.type));
      const score=u=>{
        const c=championStats(u.type,u.stars),next=teamTraits([...deployed,{type:u.type}],CHAMPIONS,p.virtualTraits);
        // Crossing off an exact Air breakpoint can make a matching unit worse.
        const matches=types.has(u.type)?0:c.traits.filter(t=>traits.counts[t]>0&&(t!=='air'||next.coinChance>=traits.coinChance)).length;
        const bonus=traitScore(next)-traitScore(traits);
        return [matches,bonus,types.has(u.type)?0:1,c.hp/100+c.damage/10];
      };
      const choices=this.bench(team).sort((a,b)=>{const aa=score(a),bb=score(b);for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])return bb[i]-aa[i];return a.id-b.id;});
      const u=choices[0],ranged=CHAMPIONS[u.type].range>1;
      const rows=team==='azure'?(ranged?[7,6,5,4]:[4,5,6,7]):(ranged?[0,1,2,3]:[3,2,1,0]);
      const columns=[3,4,2,5,1,6,0,7];
      const target=rows.flatMap(y=>columns.map(x=>({x,y}))).find(pos=>!deployed.some(v=>samePosition(v.position,pos)));
      if(!target)break;u.position=target;added.push(u.id);
    }
    return added;
  }
  // Evaluate actual unlocked traits as well as stats and a mixed frontline/backline.
  teamScore(units) {
    const traits=teamTraits(units.map(u=>({type:u.type})),CHAMPIONS,this.opponent.virtualTraits),front=units.filter(u=>CHAMPIONS[u.type].range===1).length;
    const ranged=units.length-front,distinct=new Set(units.map(u=>u.type));
    // Normalize the new HP/DPS scale so trait breakpoints still inform purchases.
    return units.reduce((n,u)=>{const c=championStats(u.type,u.stars||1);return n+c.hp/500+c.damage/c.attackTicks/5;},0)
      +traitScore(traits)
      // Reward distinct progress toward a naturally reachable focus breakpoint.
      +Math.min(traits.boardCounts[this.botElement],this.botElement==='fire'?7:10)*5.5
      +Math.min(front,Math.max(1,Math.floor(units.length/3)))*2+Math.min(ranged,2)*1.5-(units.length-distinct.size)*1.5;
  }
  bestTeam(roster=this.opponent.roster) {
    const chosen=[],remaining=roster.filter(u=>!u.overflow),limit=Math.min(this.opponent.level,remaining.length);
    while(chosen.length<limit){remaining.sort((a,b)=>this.teamScore([...chosen,b])-this.teamScore([...chosen,a])||a.id-b.id);chosen.push(remaining.shift());}
    // Local replacements preserve useful cheap trait members over raw cost upgrades.
    for(let pass=0;pass<3;pass++) {
      let improvement=null,best=this.teamScore(chosen);
      for(let i=0;i<chosen.length;i++)for(let j=0;j<remaining.length;j++) {
        const trial=chosen.slice();trial[i]=remaining[j];const score=this.teamScore(trial);
        if(score>best+.001){best=score;improvement={i,j};}
      }
      if(!improvement)break;const {i,j}=improvement;[chosen[i],remaining[j]]=[remaining[j],chosen[i]];
    }
    return chosen;
  }
  prepareBot() {
    const p=this.opponent;
    if(p.level<10&&p.gold>=this.levelPrice('ember')+2)this.levelUp('ember');
    const shopPass=()=>{
      for(let attempt=0;attempt<SHOP_SIZE;attempt++) {
        const before=this.bestTeam(),score=this.teamScore(before);
        const choices=p.shop.map((type,slot)=>{
          if(!type||!this.canBuy(slot,'ember')||p.roster.some(u=>u.type===type&&u.stars===3))return null;
          const plan=this.purchasePlan(type,'ember'),after=this.bestTeam(plan.roster);
          const collecting=p.roster.some(u=>u.type===type&&onBoard(u))&&this.bench('ember').length<4;
          return {slot,gain:this.teamScore(after)-score+(collecting ? .4 : 0)};
        }).filter(c=>c&&c.gain>.01).sort((a,b)=>b.gain-a.gain);
        if(!choices.length)break;
        this.buy(choices[0].slot,'ember');
      }
      this.positionBot();
      // Keep upgrade copies for deployed champions; sell unrelated reserves to fund levels.
      let kept=0;
      for(const u of [...this.bench('ember')]){
        const useful=p.roster.some(v=>onBoard(v)&&v.type===u.type&&v.stars<3);
        if(useful&&kept<4)kept++;else this.sell(u.id,'ember');
      }
    };
    shopPass();
    const needsUnits=this.deployed('ember').length<p.level;
    const canInvestInRolls=p.level===10||(p.gold>=20&&this.round%4===0)||(p.hp<=25&&p.lossStreak>=3);
    if(p.gold>=4&&(needsUnits||canInvestInRolls)){this.refresh('ember');shopPass();}
    this.positionBot();
  }
  positionBot() {
    const p=this.opponent,chosen=this.bestTeam(),ids=new Set(chosen.map(u=>u.id));
    let bench=0;for(const u of p.roster)if(!ids.has(u.id))u.position={bench:bench++};
    const enemies=this.deployed();
    const center=enemies.length?enemies.reduce((n,u)=>n+u.position.x,0)/enemies.length:3.5;
    const columns=Array.from({length:8},(_,i)=>i).sort((a,b)=>Math.abs(a-center)-Math.abs(b-center)||a-b);
    let front=0,back=0;
    // Keep ranged carries behind the tanks, aligned with the player's occupied flank.
    chosen.sort((a,b)=>championStats(b.type,b.stars).hp-championStats(a.type,a.stars).hp);
    for(const u of chosen) {
      if(CHAMPIONS[u.type].range>1){const i=back++;u.position={x:columns[i%8],y:Math.floor(i/8)};}
      else {const i=front++;u.position={x:columns[i%8],y:3-Math.floor(i/8)};}
    }
  }
}
