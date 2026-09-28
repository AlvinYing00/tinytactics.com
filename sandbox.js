import { Battle } from './engine.js';
import { CHAMPIONS, championStats, teamTraits } from './catalog.js';

// Formation ownership stays separate from the disposable combat simulation.
// Sandbox has no bot, shop, combinations, player damage or economy settlement.
export class Sandbox {
  constructor() {
    this.mode='sandbox';this.phase='preparation';this.round=1;this.nextId=1;this.result=null;this.lastAutoDeployed=[];
    this.players=Object.fromEntries(['azure','ember'].map(team=>[team,{team,hp:null,gold:0,level:10,xp:0,lossStreak:0,virtualTraits:{},roster:[],shop:[],shopLocked:false,retainShop:false}]));
    this.rebuildBattle();
  }
  get player(){return this.players.azure;}
  get opponent(){return this.players.ember;}
  get roundLabel(){return String(this.round);}
  get stage(){return 1;}
  editable(){if(this.phase!=='preparation')throw new Error('Reset the battle before editing formations.');}
  deployed(team='azure'){return this.players[team].roster;}
  bench(){return [];}
  levelPrice(){return 0;}
  traits(team='azure'){return teamTraits(this.deployed(team),CHAMPIONS,this.players[team].virtualTraits);}
  availableChampions(team='azure'){
    if(!this.players[team])throw new Error('Choose Azure or Ember.');
    const placed=new Set(this.deployed(team).map(u=>u.type));
    return Object.values(CHAMPIONS).filter(c=>!placed.has(c.id));
  }
  unit(id){return Object.values(this.players).flatMap(p=>p.roster).find(u=>u.id===id);}
  validPosition(team,position){
    return position&&position.bench===undefined&&Number.isInteger(position.x)&&Number.isInteger(position.y)&&position.x>=0&&position.x<8&&position.y>=0&&position.y<8&&(team==='azure'?position.y>=4:position.y<4);
  }
  add(type,team='azure',stars=1){
    this.editable();
    if(!this.players[team])throw new Error('Choose Azure or Ember.');
    const stats=championStats(type,stars),roster=this.deployed(team);
    if(roster.some(u=>u.type===type))throw new Error('This champion is already on this team. Select it on the board to change its stars.');
    if(roster.length>=10)throw new Error('This side already has 10 champions. Remove one first.');
    const ranged=stats.range>1;
    const rows=team==='azure'?(ranged?[7,6,5,4]:[4,5,6,7]):(ranged?[0,1,2,3]:[3,2,1,0]);
    const position=rows.flatMap(y=>[3,4,2,5,1,6,0,7].map(x=>({x,y}))).find(pos=>!roster.some(u=>u.position.x===pos.x&&u.position.y===pos.y));
    const unit={id:this.nextId++,type,team,stars,position};
    roster.push(unit);this.rebuildBattle();return unit;
  }
  move(id,position){
    this.editable();const unit=this.unit(id);
    if(!unit)throw new Error('Choose a champion first.');
    if(!this.validPosition(unit.team,position))throw new Error(unit.team==='azure'?'Keep Azure in the lower four rows.':'Keep Ember in the upper four rows.');
    const other=this.deployed(unit.team).find(u=>u.position.x===position.x&&u.position.y===position.y);
    if(other===unit)return null;
    const origin={...unit.position};unit.position={x:position.x,y:position.y};
    if(other)other.position=origin;
    this.rebuildBattle();return other||null;
  }
  setStars(id,stars){
    this.editable();const unit=this.unit(id);
    if(!unit)throw new Error('Choose a champion first.');
    championStats(unit.type,stars);unit.stars=stars;this.rebuildBattle();return unit;
  }
  sell(id){
    this.editable();const unit=this.unit(id);
    if(!unit)throw new Error('Choose a champion first.');
    this.players[unit.team].roster=this.deployed(unit.team).filter(u=>u.id!==id);
    this.rebuildBattle();return unit;
  }
  rebuildBattle(){
    this.battle=new Battle({cap:10,seed:this.round*2654435761});
    for(const player of Object.values(this.players))for(const owned of player.roster){
      const unit=this.battle.place(owned.type,owned.team,owned.position.x,owned.position.y,owned.stars);unit.id=owned.id;
    }
    this.battle.nextId=this.nextId;
  }
  start(){this.editable();this.rebuildBattle();this.battle.start();this.phase='combat';}
  settle(){
    if(this.result)return this.result;
    if(this.phase!=='combat'||this.battle.phase!=='finished')throw new Error('The battle is still in progress.');
    this.phase='result';
    return this.result={round:this.roundLabel,outcome:this.battle.outcome,loser:null,damage:0,matchOver:false};
  }
  reset(){this.phase='preparation';this.result=null;this.rebuildBattle();}
  nextRound(){if(this.phase!=='result')throw new Error('Finish this test first.');this.round++;this.reset();}
  clear(){this.editable();for(const p of Object.values(this.players))p.roster=[];this.reset();}
  buy(){throw new Error('Use Champions to add units freely in Sandbox.');}
  refresh(){throw new Error('All champions are available without rerolling in Sandbox.');}
  setShopLocked(){throw new Error('Sandbox does not use the shop.');}
  levelUp(){throw new Error('Both Sandbox teams are already level 10.');}
}
