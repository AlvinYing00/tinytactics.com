import { Battle } from './engine.js';
import { CHAMPIONS, SHOP_CHAMPIONS, teamTraits, championStats, sellValue } from './catalog.js';
import { combineCopies } from './combinations.js';

export const LEVEL_COSTS = Object.freeze({3:10,4:20,5:30,6:40,7:55,8:65,9:80});
export const BENCH_SIZE = 9;
export const SHOP_SIZE = 5;
export function shopOdds(level) {
  if (!Number.isInteger(level)||level<1||level>10) throw new Error('Level must be between 1 and 10.');
  return level<=3?[100,0,0,0,0]:level<=5?[50,30,20,0,0]:level<=7?[25,40,30,5,0]:level===8?[20,25,40,10,5]:level===9?[10,15,30,30,15]:[5,10,20,40,25];
}
export const stageDamage = stage => Math.min(6,stage+1);
export const streakBonus = losses => losses>=5?3:losses===4?2:losses===3?1:0;
const pool = Array.from({length:5},(_,i)=>Object.values(SHOP_CHAMPIONS).filter(c=>c.cost===i+1));
const onBoard = u => u.position.bench===undefined;
const samePosition = (a,b) => a.bench!==undefined ? a.bench===b.bench : b.bench===undefined&&a.x===b.x&&a.y===b.y;
const traitScore=t=>t.burnPercent*70+t.healPercent*50+t.shieldPercent*6+t.reflectPercent*15+(t.inheritanceHpPercent+t.inheritanceAttackPercent)*25+t.coinChance*30+t.dodgeChance*20+(t.criticalEvery?12/t.criticalEvery:0)+(t.meteor?15:0)+(t.tsunami?25:0)+(t.goldenShield?6:0)+(t.thunder?15:0)+(t.windWall?15:0)+t.classes.sentinel.reduction*10+t.classes.duelist.cap*6+t.classes.ranger.damageBonus*8+t.classes.ranger.rangeBonus*2+t.classes.support.targets*t.classes.support.healPercent*12+t.classes.support.shieldPercent*20+t.classes.assassin.damageBonus*6+t.classes.assassin.dodgeChance*6+t.classes.assassin.shieldBypass*4;

function pickChampion(cost,random,excluded){
  const eligible=pool[cost].filter(c=>!excluded.has(c.id)),roll=random();
  return eligible[Math.min(eligible.length-1,Math.floor(roll*eligible.length))]?.id??null;
}
export function rollShop(level,random=Math.random,excluded=new Set()) {
  const odds=shopOdds(level);
  return Array.from({length:SHOP_SIZE},()=>{
    const roll=random()*100;let sum=0,cost=0;
    for(;cost<4;cost++){sum+=odds[cost];if(roll<sum)break;}
    // Keep the requested cost odds, even if every identity at that cost is maxed.
    return pickChampion(cost,random,excluded);
  });
}

// Owned champions and economy survive rounds; Battle holds only combat state.
export class Campaign {
  constructor({random=Math.random}={}) {
    this.random=random;this.round=1;this.phase='preparation';this.nextId=1;this.result=null;
    this.players={};
    for(const team of ['azure','ember'])this.players[team]={team,hp:100,gold:10,level:3,xp:0,lossStreak:0,virtualTraits:{},roster:[],shop:rollShop(3,random),shopLocked:false,retainShop:false,lastIncome:null};
    this.botElement=random()<.5?'fire':'water';
    this.prepareBot();this.rebuildBattle();
  }
  get stage(){return Math.floor((this.round-1)/7)+1;}
  get roundLabel(){return `${this.stage}-${(this.round-1)%7+1}`;}
  get player(){return this.players.azure;}
  get opponent(){return this.players.ember;}
  editable(){if(this.phase!=='preparation')throw new Error('Make purchases and formation changes between battles.');}
  deployed(team='azure'){return this.players[team].roster.filter(onBoard);}
  bench(team='azure'){return this.players[team].roster.filter(u=>!onBoard(u));}
  traits(team='azure'){return teamTraits(this.deployed(team),CHAMPIONS,this.players[team].virtualTraits);}
  maxedTypes(team='azure'){return new Set(this.players[team].roster.filter(u=>u.stars===3).map(u=>u.type));}
  freeBench(team){const used=new Set(this.bench(team).map(u=>u.position.bench));return Array.from({length:BENCH_SIZE},(_,i)=>i).find(i=>!used.has(i));}
  purchasePlan(type,team='azure'){
    const candidate={id:this.nextId,type,team,stars:1,position:{bench:this.freeBench(team)??BENCH_SIZE}};
    return combineCopies([...this.players[team].roster,candidate],type,candidate.id);
  }
  canBuy(slot,team='azure'){
    const p=this.players[team],type=p.shop[slot];
    return this.phase==='preparation'&&!!type&&!this.maxedTypes(team).has(type)&&p.gold>=CHAMPIONS[type].cost&&this.purchasePlan(type,team).roster.filter(u=>!onBoard(u)).length<=BENCH_SIZE;
  }
  buy(slot,team='azure') {
    this.editable();const p=this.players[team];
    if(!Number.isInteger(slot)||slot<0||slot>=SHOP_SIZE||!p.shop[slot])throw new Error('That shop card is no longer available.');
    const type=p.shop[slot],champion=CHAMPIONS[type];
    if(this.maxedTypes(team).has(type))throw new Error(`${champion.name} is already at 3 stars.`);
    if(p.gold<champion.cost)throw new Error(`You need ${champion.cost} gold to recruit ${champion.name}.`);
    const plan=this.purchasePlan(type,team);
    if(plan.roster.filter(u=>!onBoard(u)).length>BENCH_SIZE)throw new Error('Your bench is full. Deploy, combine or sell a champion first.');
    const existing=new Map(p.roster.map(u=>[u.id,u]));
    p.roster=plan.roster.map(u=>{const old=existing.get(u.id);if(old){Object.assign(old,u);return old;}return u;});
    this.nextId++;p.gold-=champion.cost;p.shop[slot]=null;
    if(plan.unit.stars===3){
      const excluded=this.maxedTypes(team);
      // Replace other copies already in the shop without charging a refresh.
      p.shop=p.shop.map(offer=>offer&&excluded.has(offer)?pickChampion(CHAMPIONS[offer].cost-1,this.random,excluded):offer);
    }
    if(team==='azure')this.rebuildBattle();
    return p.roster.find(u=>u.id===plan.unit.id);
  }
  refresh(team='azure') {
    this.editable();const p=this.players[team];
    if(p.gold<2)throw new Error('You need 2 gold to refresh the shop.');
    p.gold-=2;p.shop=rollShop(p.level,this.random,this.maxedTypes(team));
  }
  setShopLocked(locked,team='azure'){
    this.editable();
    if(typeof locked!=='boolean')throw new Error('Choose whether to lock the shop.');
    this.players[team].shopLocked=locked;return locked;
  }
  levelUp(team='azure') {
    this.editable();const p=this.players[team],cost=this.levelPrice(team);
    if(p.level===10)throw new Error('Level 10 is the maximum level.');
    if(p.gold<cost)throw new Error(`You need ${cost} gold to reach level ${p.level+1}.`);
    p.gold-=cost;p.level++;p.xp=0;return p.level;
  }
  levelPrice(team='azure'){
    const p=this.players[team];return p.level<10?Math.max(0,LEVEL_COSTS[p.level]-p.xp):0;
  }
  gainExperience(team,amount){
    const p=this.players[team],before=p.level;
    if(p.level===10)return {gained:0,levels:0,level:10,xp:0};
    p.xp+=amount;
    while(p.level<10&&p.xp>=LEVEL_COSTS[p.level]){p.xp-=LEVEL_COSTS[p.level];p.level++;}
    if(p.level===10)p.xp=0;
    return {gained:amount,levels:p.level-before,level:p.level,xp:p.xp};
  }
  move(id,target) {
    this.editable();const p=this.player,u=p.roster.find(v=>v.id===id);
    if(!u)throw new Error('Select one of your champions.');
    const toBench=target.bench!==undefined;
    if(toBench){if(!Number.isInteger(target.bench)||target.bench<0||target.bench>=BENCH_SIZE)throw new Error('Choose a bench slot.');}
    else if(!Number.isInteger(target.x)||!Number.isInteger(target.y)||target.x<0||target.x>7||target.y<4||target.y>7)throw new Error('Deploy in your lower four rows.');
    const other=p.roster.find(v=>samePosition(v.position,target));
    if(other===u)return null;
    if(!toBench&&!onBoard(u)&&!other&&this.deployed().length>=p.level)throw new Error(`Level ${p.level} allows ${p.level} champions. Swap with a teammate or level up.`);
    const origin={...u.position};u.position=toBench?{bench:target.bench}:{x:target.x,y:target.y};
    if(other)other.position=origin;
    this.rebuildBattle();return other||null;
  }
  sell(id,team='azure') {
    this.editable();const p=this.players[team],index=p.roster.findIndex(u=>u.id===id);
    if(index<0)throw new Error('Select one of your champions.');
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
    for(const p of Object.values(this.players)){
      if(!p.retainShop)p.shop=rollShop(p.level,this.random,this.maxedTypes(p.team));
      p.retainShop=false;
    }
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
    const chosen=[],remaining=[...roster],limit=Math.min(this.opponent.level,roster.length);
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
