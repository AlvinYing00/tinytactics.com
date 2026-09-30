import {Campaign} from './campaign.js';
import {drawChampion} from './shop.js';
import {Battle} from './engine.js';
import {CHAMPIONS,championStats,teamTraits} from './catalog.js';
import {BOT_STYLES,planBot} from './bot-planner.js';
import {COMBAT_CATALOG,encounter} from './encounters.js';

export const LEVEL_COSTS=Object.freeze({3:6,4:10,5:20,6:36,7:60,8:68,9:68});
export const stageDamage=stage=>[2,2,5,8,10,12,17][Math.min(6,Math.max(0,stage-1))];
export const streakBonus=count=>Math.abs(count)>=6?3:Math.abs(count)>=5?2:Math.abs(count)>=2?1:0;
export const PREPARATION_SECONDS=30,FACEOFF_SECONDS=3,INTERMISSION_SECONDS=1.5;
const clone=value=>JSON.parse(JSON.stringify(value));
const onBoard=u=>u.position.bench===undefined;
const names=['Azure','Cinder','Pearl','Volt','Granite','Zephyr','Prism','Solstice'];
const blankOpponent={team:'neutral',name:'Opponent arrives at combat',hp:null,level:0,roster:[],virtualTraits:{},gold:0};

// Persistent eight-company match. Each matchup owns an independent two-sided Battle.
export class League extends Campaign {
  constructor({random=Math.random}={}){
    super({random,initialize:false});this.mode='fight';this.levelCosts=LEVEL_COSTS;this.phase='lobby';this.viewId='azure';
    this.preparationRemaining=PREPARATION_SECONDS;this.intermissionRemaining=0;this.preparationSerial=0;this.matches=[];this.pairs=[];this.previewBoards=new Map();this.winnerId=null;this.nextId=1;
    this.rotation=null;this.rotationKey='';this.rotationIndex=0;this.lastAutoDeployed=[];this.results={};
    this.faceoffRemaining=0;this.combatElapsed=0;this.botActions=[];this.createPlayers(false);
  }
  createPlayers(withRoster){
    this.players={};
    const difficulties=['easy','easy','normal','normal','normal','strong','strong'];
    for(let i=difficulties.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[difficulties[i],difficulties[j]]=[difficulties[j],difficulties[i]];}
    for(let i=0;i<8;i++){
      const id=i===0?'azure':`bot-${i}`;
      const p={team:id,name:names[i],bot:i>0,style:i?BOT_STYLES[i-1]:null,difficulty:i?difficulties[i-1]:null,hp:100,gold:10,level:3,xp:0,lossStreak:0,winStreak:0,streak:0,virtualTraits:{},roster:[],shop:[],shopLocked:false,retainShop:false,lastIncome:null,placement:null};
      this.players[id]=p;
    }
    if(withRoster){
      const stock=this.poolStock();
      for(const p of Object.values(this.players)){
        const selected=new Set();
        for(let n=0;n<3;n++){
          const type=drawChampion(1,this.random,selected,stock);
          if(type){selected.add(type);p.roster.push({id:this.nextId++,type,stars:1,team:p.team,position:{bench:n}});}
        }
        this.autoDeploy(p.team);
      }
      this.refreshRoundShops();
    }
  }
  startGame(){
    if(this.phase!=='lobby')throw new Error('A match is already in progress.');
    this.phase='preparation';this.createPlayers(true);this.beginPreparation();
  }
  get livingPlayers(){return Object.values(this.players).filter(p=>p.hp>0);}
  get isMonsterRound(){return this.round%7===0;}
  get opponent(){return this.view().ember;}
  get battle(){return this.view().battle;}
  editable(){
    if(this.phase!=='preparation'||this.player.hp<=0)throw new Error('Manage your team during preparation while you are still in the match.');
  }
  canTrade(){return ['preparation','faceoff','combat','intermission'].includes(this.phase)&&this.player.hp>0;}
  economyEditable(){if(!this.canTrade())throw new Error('Trading is available while you are still in the match.');}
  setShopLocked(locked,team='azure'){
    super.setShopLocked(locked,team);
    if(this.phase==='intermission')this.players[team].retainShop=locked;
    return locked;
  }
  rebuildBattle(){this.previewBoards?.clear();}
  autoDeploy(team='azure'){
    const ctx=Object.create(Campaign.prototype);Object.assign(ctx,{players:{azure:this.players[team]},phase:'preparation',levelCosts:LEVEL_COSTS});
    return Campaign.prototype.autoDeploy.call(ctx,'azure');
  }
  makePairs(){
    const alive=this.livingPlayers.map(p=>p.team),key=`${this.stage}:${alive.join(',')}`;
    if(this.rotationKey!==key){
      const order=[...alive];for(let i=order.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      if(order.length%2)order.push(null);this.rotation=order;this.rotationKey=key;this.rotationIndex=0;
    }
    const order=this.rotation,pairs=[];
    for(let i=0;i<order.length/2;i++){
      let a=order[i],b=order[order.length-1-i];
      if(!a||!b){const solo=a||b,others=alive.filter(id=>id!==solo);const donor=others[this.rotationIndex%others.length];pairs.push({azureId:solo,emberId:donor,ghost:true});}
      else {if(b==='azure')[a,b]=[b,a];pairs.push({azureId:a,emberId:b,ghost:false});}
    }
    this.rotation=[order[0],order.at(-1),...order.slice(1,-1)];this.rotationIndex++;return pairs;
  }
  beginPreparation(){
    this.phase='preparation';this.preparationRemaining=PREPARATION_SECONDS;this.preparationSerial++;this.botsPrepared=false;this.matches=[];this.results={};this.result=null;
    if(this.player.hp>0)this.viewId='azure';
    this.pairs=this.isMonsterRound?this.livingPlayers.map(p=>({azureId:p.team,monster:true})):this.makePairs();
    if(this.round>1){this.refreshRoundShops();for(const p of this.livingPlayers)p.shopLocked=false;}
    this.botActions=this.livingPlayers.filter(p=>p.bot).flatMap(p=>{
      const times=p.difficulty==='easy'?[[18,false]]:p.difficulty==='normal'?[[10,false],[22,true]]:[[5,false],[15,true],[24,false],[29,true]];
      return times.map(([at,positionOnly])=>({id:p.team,at,positionOnly,done:false}));
    }).sort((a,b)=>a.at-b.at);
    this.rebuildBattle();
  }
  opponentFor(id){const pair=this.pairs.find(p=>p.azureId===id||(!p.ghost&&p.emberId===id));return pair?.monster?null:this.players[pair?.azureId===id?pair.emberId:pair?.azureId];}
  visibleOpponent(id){const p=this.opponentFor(id);return p?{team:p.team,roster:clone(p.roster.filter(onBoard))}:null;}
  prepareBots(positionOnly=false,ids=null){
    // Snapshot every scoutable formation before planning, avoiding order-dependent peeking.
    const scout=new Map(this.livingPlayers.map(p=>[p.team,this.visibleOpponent(p.team)]));
    for(const p of this.livingPlayers.filter(p=>p.bot&&(!ids||ids.includes(p.team))))planBot(this,p,scout.get(p.team),{positionOnly});
    this.botsPrepared=true;this.rebuildBattle();
  }
  revealOpponents(){
    if(!this.botsPrepared)this.prepareBots();
    this.lastAutoDeployed=this.player.hp>0?this.autoDeploy('azure'):[];
    const roundRosters=Object.fromEntries(this.livingPlayers.map(p=>[p.team,clone(p.roster.filter(onBoard))]));
    this.matches=this.pairs.map((pair,index)=>{
      const monster=pair.monster?encounter(this.stage,this.random):null;
      const sides={azure:pair.azureId,ember:pair.emberId};
      const b=new Battle({catalog:COMBAT_CATALOG,cap:10,timeout:Infinity,seed:(this.round*2654435761+index*7919)>>>0,
        traitCounts:{azure:this.players[pair.azureId].virtualTraits,ember:pair.monster?{}:this.players[pair.emberId].virtualTraits},
        onGold:(team,amount)=>{if(team==='ember'&&(pair.ghost||pair.monster))return;this.players[sides[team]].gold+=amount;}});
      for(const side of ['azure','ember'])for(const owned of side==='ember'&&monster?monster.roster:roundRosters[sides[side]]){
        const u=b.place(owned.type,side,owned.position.x,side==='azure'?owned.position.y:7-owned.position.y,owned.stars);u.id=side==='ember'&&(pair.ghost||monster)?-(index*100+Math.abs(owned.id)+1):owned.id;
      }
      b.nextId=this.nextId;
      return {...pair,id:`${this.round}-${index}`,battle:b,monster,settled:false};
    });
    this.phase='faceoff';this.faceoffRemaining=FACEOFF_SECONDS;this.rebuildBattle();
  }
  startCombats(){
    if(this.phase==='preparation')this.revealOpponents();
    if(this.phase!=='faceoff')return;
    for(const {battle:b} of this.matches){
      if(b.living('azure').length&&b.living('ember').length)b.start();
      else{b.phase='finished';b.outcome=b.living('azure').length?'azure':b.living('ember').length?'ember':'draw';}
    }
    this.phase='combat';this.combatElapsed=0;
  }
  get combatSpeed(){return this.combatElapsed<30-1e-9?1:this.combatElapsed<45-1e-9?2:3;}
  matchFor(id){return this.matches.find(m=>m.azureId===id||(!m.ghost&&!m.monster&&m.emberId===id));}
  previewFor(id){
    if(!this.previewBoards.has(id)){
      const b=new Battle({catalog:COMBAT_CATALOG,cap:10});
      for(const own of this.players[id].roster.filter(onBoard)){const u=b.place(own.type,'azure',own.position.x,own.position.y,own.stars);u.id=own.id;}
      this.previewBoards.set(id,b);
    }
    return this.previewBoards.get(id);
  }
  view(){
    const id=this.players[this.viewId]?this.viewId:'azure',p=this.players[id],m=this.matchFor(id);
    if(m&&this.phase!=='preparation'&&this.phase!=='lobby'){
      const top=m.monster?{...blankOpponent,name:m.monster.name,monster:true,roster:m.monster.roster}:m.ghost?{...this.players[m.emberId],name:`Echo · ${this.players[m.emberId].name}`,ghost:true}:this.players[m.emberId];
      return {battle:m.battle,azure:this.players[m.azureId],ember:top,match:m,watching:id!=='azure',viewed:p};
    }
    return {battle:this.previewFor(id),azure:p,ember:{...blankOpponent,name:this.isMonsterRound?'Monsters arrive at combat':'Opponent arrives at combat'},watching:id!=='azure',viewed:p};
  }
  scout(id){if(!this.players[id])throw new Error('Choose a player in this lobby.');this.viewId=id;for(const m of this.matches)m.battle.drainEvents();return this.view();}
  playerStatus(id){
    const p=this.players[id];if(this.phase==='finished'&&p.team===this.winnerId)return 'Winner';if(p.hp<=0)return 'OUT';if(this.phase==='lobby')return 'Ready';
    if(this.phase==='preparation')return 'Preparing';if(this.phase==='faceoff')return 'Ready to fight';if(this.phase==='intermission')return 'Round complete';
    if(this.phase==='finished')return p.team===this.winnerId?'Winner':'OUT';
    return this.matchFor(id)?.battle.phase==='finished'?'Waiting':'Fighting';
  }
  get pendingFights(){return this.matches.filter(m=>m.battle.phase!=='finished').length;}
  settleAll(){
    if(this.phase!=='combat'||this.pendingFights)return;
    const survivorsAtStart=this.livingPlayers.length;
    for(const m of this.matches){
      if(m.settled)continue;m.settled=true;
      const b=m.battle;
      for(const side of ['azure','ember']){
        if(side==='ember'&&(m.ghost||m.monster))continue;
        const id=side==='azure'?m.azureId:m.emberId,p=this.players[id],other=side==='azure'?'ember':'azure';
        const win=b.outcome===side,draw=b.outcome==='draw',survivors=b.living(other).length;
        const damage=m.monster?(win?0:m.monster.penalty):win?0:stageDamage(this.stage)+(draw?0:survivors);
        const healthBefore=p.hp,healing=m.monster&&win?Math.min(100-p.hp,m.monster.reward):0;
        p.hp=Math.max(0,Math.min(100,p.hp-damage+healing));
        const loss=m.monster?!win:!win&&!draw;p.winStreak=win?p.winStreak+1:0;p.lossStreak=loss?p.lossStreak+1:0;p.streak=p.winStreak||-p.lossStreak;
        const income={base:5,interest:Math.min(5,Math.floor(p.gold/10)),win:win?1:0,streak:streakBonus(p.streak)};income.total=income.base+income.interest+income.win+income.streak;
        p.gold+=income.total;p.lastIncome=income;const xp=this.gainExperience(id,2);p.retainShop=p.shopLocked;p.shopLocked=false;
        this.results[id]={outcome:win?'win':loss?'loss':'draw',damage,healing,survivors,income,xp,healthBefore,finalHealth:healthBefore-damage,monster:!!m.monster,ghost:!!m.ghost,opponent:other==='ember'?m.emberId:m.azureId};
      }
    }
    const fallen=this.livingPlayers.length<survivorsAtStart?Object.values(this.players).filter(p=>p.hp===0&&p.placement===null).sort((a,b)=>this.results[a.team].finalHealth-this.results[b.team].finalHealth||this.results[a.team].healthBefore-this.results[b.team].healthBefore||a.team.localeCompare(b.team)):[];
    let place=survivorsAtStart;for(const p of fallen){p.placement=place--;p.eliminatedRound=this.round;}
    if(this.livingPlayers.length<=1){const champion=this.livingPlayers[0]||fallen.at(-1);champion.placement=1;this.winnerId=champion.team;}
    this.result=this.results.azure;this.phase='intermission';this.intermissionRemaining=1.5;
  }
  advance(seconds){
    if(!Number.isFinite(seconds)||seconds<0)throw new Error('Elapsed time must be finite and non-negative.');
    let remaining=seconds;
    while(remaining>1e-9&&!['lobby','finished'].includes(this.phase)){
      if(this.phase==='preparation'){
        const elapsed=PREPARATION_SECONDS-this.preparationRemaining;
        const due=this.botActions.filter(a=>!a.done&&a.at<=elapsed+1e-9);
        for(const positionOnly of [false,true]){
          const actions=due.filter(a=>a.positionOnly===positionOnly);
          if(actions.length)this.prepareBots(positionOnly,actions.map(a=>a.id));
          actions.forEach(a=>a.done=true);
        }
        const next=this.botActions.find(a=>!a.done),until=next?Math.max(0,next.at-elapsed):Infinity;
        const used=Math.min(remaining,this.preparationRemaining,until);this.preparationRemaining-=used;remaining-=used;
        if(this.preparationRemaining<=1e-9){this.preparationRemaining=0;this.revealOpponents();}
      }else if(this.phase==='faceoff'){
        const used=Math.min(remaining,this.faceoffRemaining);this.faceoffRemaining-=used;remaining-=used;
        if(this.faceoffRemaining<=1e-9){this.faceoffRemaining=0;this.startCombats();}
      }else if(this.phase==='combat'){
        const speed=this.combatSpeed,boundary=speed===1?30:speed===2?45:60;
        const used=Math.min(remaining,.1,Math.max(0,boundary-this.combatElapsed));
        for(const m of this.matches)if(m.battle.phase==='combat')m.battle.advance(used*speed);
        this.combatElapsed+=used;remaining-=used;
        if(this.combatElapsed>=60-1e-9){
          this.combatElapsed=60;
          for(const {battle:b} of this.matches)if(b.phase==='combat'){b.phase='finished';b.outcome='draw';b.traits.finish();b.events.push({type:'end',outcome:'draw'});}
        }
        if(!this.pendingFights)this.settleAll();
      }else{
        const used=Math.min(remaining,this.intermissionRemaining);remaining-=used;this.intermissionRemaining-=used;
        if(this.intermissionRemaining<=1e-9){if(this.winnerId)this.phase='finished';else {this.round++;this.beginPreparation();}}
      }
    }
  }
  drainViewEvents(){const visible=this.battle,events=visible.drainEvents();for(const m of this.matches)if(m.battle!==visible)m.battle.drainEvents();return events;}
  start(){if(this.phase==='lobby')return this.startGame();throw new Error('Combat starts automatically after the 30-second preparation and three-second face-off.');}
  settle(){throw new Error('Rounds settle automatically after every fight finishes.');}
  nextRound(){throw new Error('The next round begins automatically after the shared transition.');}
}
