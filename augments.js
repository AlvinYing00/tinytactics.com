import {CHAMPIONS} from './catalog.js';

export const AUGMENT_SECONDS=30;
export const AUGMENT_ROUNDS=Object.freeze([4,11,18,25,32]);
export const AUGMENT_TYPE_STAGES=Object.freeze({economy:[1,2,5],trait:[2,3,4],class:[2,3,4],combat:[2,3,5]});
const entries=[];
const add=(id,name,stages,description,effect,icon='coins')=>entries.push(Object.freeze({id,name,stages,type:'economy',description,effect,icon}));
add('snowballing','Snowballing',[1,2],'Earn 1 interest per 10 gold, with no interest cap.',{interest:true});
add('investment','Low Risk, High Return',[1,2],'Invest all your gold. After 3 completed rounds, receive it back plus 50 gold.',{investment:true},'clock');
add('side-hustle','Side Hustle',[1,2],'Gain 3 gold before every fight, starting this round.',{hustle:3});
add('windfall','Windfall',[1],'Gain 20 gold now.',{gold:20});
add('xp-boost','XP Boost',[1],'Gain 20 XP now.',{xp:20},'level');
add('level-discount','Level-up Discount',[1],'Pay 25% less gold for the remaining XP needed to level up.',{discount:.75},'level');
add('death-contract','Death Contract',[1],'Level with HP instead of gold at 25% off the remaining XP price. Restore 2 HP after each round. Lethal payments are blocked.',{deathContract:true},'heart');
add('quick-formation','Quick Formation',[1],'Immediately reach level 7. Your level stays capped at 7 for this game.',{quick:true},'level');
add('assistants','Assistants',[1,2],'Gain one random 3-cost, two 2-costs, and three 1-cost champions.',{gifts:[3,2,2,1,1,1]},'gift');
add('higher','Higher and higher',[1,2],'Gain one level now. Unlock level 11 and space for 11 champions; level 10 → 11 needs 76 XP.',{higher:true},'level');
add('elite-journey','Elite Journey',[1],'Gain a random 4-cost champion. Receive the same champion again at 1-7 and 2-3.',{elite:true},'gift');
add('windfall-plus','Windfall+',[2],'Gain 40 gold now.',{gold:40});
add('three-stars-born','3 stars born',[2],'Your next 1-cost purchase becomes a 3-star champion.',{purchase:{cost:1,stars:3,count:1}},'stars');
add('two-twice','Two, Twice',[2],'Your next 2-cost purchase gives two identical 2-star champions.',{purchase:{cost:2,stars:2,count:2}},'stars');
add('triple-three','Triple Three',[2],'Your next 3-cost purchase becomes a 2-star champion.',{purchase:{cost:3,stars:2,count:1}},'stars');
add('free-rerolls','Free Rerolls',[2],'Gain 10 free shop rerolls. Unused rerolls stay until spent.',{rerolls:10},'refresh');
add('windfall-max','Windfall++',[5],'Gain 100 gold now.',{gold:100});
add('legendary-skyfall','Legendary Skyfall',[5],'Gain two random 5-cost champions.',{gifts:[5,5]},'gift');
add('ascend','Ascend',[5],'Your next 4-cost purchase becomes a 2-star champion.',{purchase:{cost:4,stars:2,count:1}},'stars');
add('roll-until-you-die','Roll until you die',[5],'All shop rerolls are free during 5-5 preparation only.',{freeRound:33},'refresh');
add('free-rerolls-plus','Free Rerolls+',[5],'Gain 50 free shop rerolls. Unused rerolls stay until spent.',{rerolls:50},'refresh');
for(const [filter,values] of [['element',['electric','mountain','water','fire','air']],['combatRole',['sentinel','ranger','support','duelist','assassin']]])for(const value of values){
 const name=value==='sentinel'?'Tanker':value[0].toUpperCase()+value.slice(1);
 add(`legendary-${value}`,name,[5],`Gain two random 5-cost ${name} champions.`,{gifts:[5,5],filter:{[filter]:value}},value);
}
const combat=(id,name,description,icon='combat',requires={})=>entries.push(Object.freeze({id,name,stages:[2,3,5],type:'combat',description,effect:{combat:id},icon,requires:Object.freeze(requires)}));
combat('united-front','United Front','With 3+ allies in the first row at combat start, those allies take 10% less basic-attack damage. Stacks with Tanker.','front',{row:'front',minimum:3});
combat('guardian-angel','Guardian Angel','Each Ranger revives once per combat with 10% max HP and 50% Attack.','angel',{role:'ranger'});
combat('shadow-killer','Shadow Killer','An Assassin that scores a kill immediately dashes to its next target and the next basic attack deals 50% extra damage. Assists do not count; Wind Wall blocks crossing.','assassin',{role:'assassin'});
combat('grand-challenge','Grand Challenge','Duelists have a 30% chance to repel a basic attack and return its damage to the attacker.','duelist',{role:'duelist'});
combat('spirit-helper','Spirit Helper','Support basic attacks heal the lowest-health ally for 20% of damage dealt.','support',{role:'support'});
combat('hold-on','Hold on','At combat start, stun 3 random enemies for 2s. Control immunity blocks the stun.','stun');
combat('redemption','Redemption','After 5s of combat, heal every ally for 20% of its max HP.','heart');
combat('anti-control','Anti-control','All allies resist stun, freeze, fear, Chill and Tsunami for the first 3s. Does not extend Golden Shield.','shield');
combat('bigger-and-bigger','Bigger and Bigger','Your champions gain 20% max HP for the rest of the game.','grow');
combat('executioner','Executioner','Your team’s damage executes enemies below 10% max HP.','execution');
combat('one-shot','One shot','Ranger basic attacks have a 5% chance to instantly kill their target.','ranger',{role:'ranger'});
combat('suicide-frontliner','Suicide frontliner','When a Tanker dies, it deals 25% of its own max HP as damage to one nearest enemy.','burst',{role:'sentinel'});
combat('backline-angel','Backline Angel','Supports take no damage during the first 3s of combat.','angel',{role:'support'});
combat('weak-hunter','Weak Hunter','Assassins gain a 25% chance to critically strike for 2× basic-attack damage.','assassin',{role:'assassin'});
combat('royal-dancer','Royal Dancer','Every 3rd attack, Duelists dash to a free adjacent tile, deal 50% extra basic damage to their target regardless of range, and heal 10% max HP.','duelist',{role:'duelist'});
combat('united-back','United Back','With 3+ allies in the fourth row at combat start, those allies take 10% less basic-attack damage. Stacks with Tanker.','back',{row:'back',minimum:3});
combat('smaller-and-smaller','Smaller and Smaller','Your champions gain 50% basic-attack damage but lose 25% max HP for the rest of the game.','shrink');
combat('solo-hero','Solo hero','Allies alone in their starting row take no damage for the first 2s of combat.','solo',{loneRow:true});
combat('anti-shield','Anti Shield','Your champions deal 25% extra basic-attack damage to shielded enemies. Stacks with Assassin shield bypass.','broken-shield');
combat('fire-fighter','Fire Fighter','Your champions take 20% less Fire Burn damage.','fire');
combat('anti-shock','Anti Shock','Your champions take 50% less Thunder damage. Thunder’s low-HP execution rule is unchanged.','electric');
export const AUGMENTS=Object.freeze(Object.fromEntries(entries.map(a=>[a.id,a])));
export const hasAugment=(player,id)=>(player.augments||[]).includes(id);
export const maxLevel=player=>hasAugment(player,'quick-formation')?7:hasAugment(player,'higher')?11:10;
export const levelCurrency=player=>hasAugment(player,'death-contract')?'HP':'gold';
export const interestFor=player=>Math.min(hasAugment(player,'snowballing')?Infinity:5,Math.floor(player.gold/10));
export const freeRoundRerolls=(game,player)=>player.freeRerollRound===game.round&&game.phase==='preparation';
export const refreshPrice=(game,player)=>freeRoundRerolls(game,player)||(player.freeRerolls||0)>0?0:2;
const deployedFor=player=>(player.roster||[]).filter(u=>u.position&&u.position.bench===undefined&&!u.overflow&&CHAMPIONS[u.type]);
// League rosters use the lower half even for bots; the legacy ember roster is mirrored.
const rowFor=(game,player,row)=>player.team==='ember'&&game.mode!=='fight'?(row==='front'?3:0):(row==='front'?4:7);
export function combatAugmentMatchesTeam(game,player,augment){
 const deployed=deployedFor(player),rule=augment.requires||{};
 if(!deployed.length)return false;
 if(rule.role&&!deployed.some(u=>CHAMPIONS[u.type].traits.includes(rule.role)))return false;
 if(rule.row&&deployed.filter(u=>u.position.y===rowFor(game,player,rule.row)).length<rule.minimum)return false;
 if(rule.loneRow&&!deployed.some(u=>deployed.filter(v=>v.position.y===u.position.y).length===1))return false;
 return true;
}
export function eligibleAugments(game,player,seen=[]){
 return entries.filter(a=>AUGMENT_TYPE_STAGES[a.type].includes(game.stage)&&a.stages.includes(game.stage)&&!hasAugment(player,a.id)&&!seen.includes(a.id)&&!(a.effect.higher&&hasAugment(player,'quick-formation'))&&(a.type!=='combat'||combatAugmentMatchesTeam(game,player,a)));
}
const pick=(items,random)=>items[Math.min(items.length-1,Math.floor(random()*items.length))];
export function createChoice(game,player){
 const eligible=eligibleAugments(game,player);if(eligible.length<3)return null;
 const offers=[];for(let i=0;i<3;i++){const a=pick(eligible,game.random);offers.push(a.id);eligible.splice(eligible.indexOf(a),1);}
 return {round:game.round,offers,seen:[...offers],rerolled:[false,false,false],selected:null};
}
export function rerollAugment(game,team,slot){
 const p=game.players[team],choice=p.augmentChoice;
 if(game.phase!=='preparation'||p.hp<=0||!choice||choice.round!==game.round||choice.selected||!Number.isInteger(slot)||slot<0||slot>2||choice.rerolled[slot])throw new Error('This Augment card cannot be rerolled again.');
 const replacement=pick(eligibleAugments(game,p,choice.seen),game.random);
 if(!replacement)throw new Error('No unseen Augments remain.');
 choice.offers[slot]=replacement.id;choice.seen.push(replacement.id);choice.rerolled[slot]=true;return replacement;
}
export function selectAugment(game,team,id){
 const p=game.players[team],choice=p.augmentChoice;
 if(game.phase!=='preparation'||p.hp<=0||!choice||choice.round!==game.round||choice.selected||!choice.offers.includes(id)||hasAugment(p,id))throw new Error('Choose one of your available Augments.');
 const a=AUGMENTS[id],e=a.effect;p.augments??=[];p.augments.push(id);choice.selected=id;
 if(e.gold)p.gold+=e.gold;
 if(e.xp)game.gainExperience(team,e.xp);
 if(e.investment){p.investment={gold:p.gold,rounds:3};p.gold=0;}
 if(e.quick){p.level=7;p.xp=0;}
 if(e.higher){p.level=Math.min(11,p.level+1);p.xp=0;}
 if(e.rerolls)p.freeRerolls=(p.freeRerolls||0)+e.rerolls;
 if(e.freeRound)p.freeRerollRound=e.freeRound;
 if(e.purchase)p.purchaseBoosts={...p.purchaseBoosts,[e.purchase.cost]:e.purchase};
 if(e.gifts)for(const cost of e.gifts)game.giftChampion(team,{cost,...e.filter});
 if(e.elite){const unit=game.giftChampion(team,{cost:4});p.eliteJourney={type:unit.type,pending:[7,10]};}
 game.rebuildBattle();return a;
}
export function chooseBotAugment(game,player){
 const score=id=>{
  const a=AUGMENTS[id],e=a.effect,s=player.style?.id;
  if(a.type==='combat'){
   const deployed=deployedFor(player),rule=a.requires,matching=rule.role?deployed.filter(u=>CHAMPIONS[u.type].traits.includes(rule.role)).length:rule.row?deployed.filter(u=>u.position.y===rowFor(game,player,rule.row)).length:deployed.length;
   // Only the bot's own public formation influences its combat pick.
   return 10+Math.min(8,matching*2)+(rule.role===player.style?.class?3:0)+(s==='flexible'?3:0)+(player.hp<35?3:0);
  }
  return (e.gold?e.gold/8:0)+(e.rerolls?e.rerolls*(s==='reroller'?2:.8):0)+(e.higher?(s==='leveler'||s==='late'?18:9):0)+(e.interest?(s==='economist'?20:8):0)+(e.hustle?12:0)+(e.discount?13:0)+(e.quick?10:0)+(e.xp?10:0)+(e.gifts?e.gifts.reduce((n,c)=>n+c,0)+(e.filter?.element===player.style?.element?10:0):0)+(e.purchase?(s==='reroller'?16:9):0)+(e.elite?14:0)+(e.investment?8+player.gold/10:0)+(e.deathContract?(player.hp>70?7:0):0)+(e.freeRound?15:0);
 };
 const offers=player.augmentChoice.offers;
 const id=player.difficulty==='easy'?pick(offers,game.random):offers.slice().sort((a,b)=>score(b)-score(a))[0];
 return selectAugment(game,player.team,id);
}
export function augmentRoundStart(game,player){
 const journey=player.eliteJourney;
 if(journey?.pending.includes(game.round)){journey.pending=journey.pending.filter(r=>r!==game.round);game.giftChampion(player.team,{type:journey.type});}
}
export function augmentBeforeFight(game,player){
 if(player.augmentFightRound===game.round)return;player.augmentFightRound=game.round;
 if(hasAugment(player,'side-hustle'))player.gold+=3;
 game.sellOverflow(player.team);
}
export function augmentRoundEnd(player){
 if(player.hp<=0)return;
 if(hasAugment(player,'death-contract'))player.hp=Math.min(100,player.hp+2);
 if(player.investment&&--player.investment.rounds===0){player.gold+=player.investment.gold+50;player.investment=null;}
}
