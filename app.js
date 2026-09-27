import { distance } from './engine.js';
import { CHAMPIONS as ARCHETYPES, SHOP_CHAMPIONS, ARCHETYPES as ROLES, ELEMENT_LABELS, championStats, sellValue } from './catalog.js';
import { Campaign, LEVEL_COSTS, BENCH_SIZE, shopOdds, stageDamage, streakBonus } from './campaign.js';
import { registerGameTools } from './webmcp.js';
import { attachBoardDrag } from './drag.js';
import { createTraitHud,traitIcon } from './trait-ui.js';
import { ResultReveal,scoutOpponent } from './ui-state.js';

const $=selector=>document.querySelector(selector);
const board=$('#board'),unitLayer=$('#units'),shell=$('.board-shell');
let campaign=new Campaign(),battle=campaign.battle,selection=null,paused=false,speed=1;
let lastTime=0,sound=false,audio=null,shopKey='',draggedId=null;
const tiles=[],views=new Map(),benchTiles=[];
const resultReveal=new ResultReveal();
let scoutingKey='',resumeAfterScout=false;
let resumeAfterTrait=false;
const traitHud=createTraitHud({rail:$('#trait-list'),dialog:$('#trait-dialog'),ambience:$('#territory-ambience'),enemyAmbience:$('#enemy-territory-ambience'),
  onOpen:()=>{resumeAfterTrait=campaign.phase==='combat'&&!paused;if(resumeAfterTrait){paused=true;render();}},
  onClose:()=>{if(resumeAfterTrait&&campaign.phase==='combat'&&!document.hidden){paused=false;lastTime=performance.now();render();}resumeAfterTrait=false;}
});
const coordinate=(x,y)=>y===8?'Bench '+(x+1):String.fromCharCode(65+x)+(8-y);
const starLabel=u=>'★'.repeat(u.stars||1);
const editable=()=>campaign.phase==='preparation';
const owned=id=>campaign.player.roster.find(u=>u.id===id);
const atPosition=(x,y)=>y===8?campaign.bench().find(u=>u.position.bench===x):battle.at(x,y);
const snapshot=()=>({
  phase:campaign.phase,round:campaign.roundLabel,paused,outcome:battle.outcome,seconds:battle.tick/10,
  players:Object.fromEntries(Object.entries(campaign.players).map(([team,p])=>[team,{hp:p.hp,gold:p.gold,level:p.level,xp:p.xp,levelPrice:campaign.levelPrice(team),lossStreak:p.lossStreak,roster:p.roster,shop:team==='azure'?p.shop:undefined,shopLocked:p.shopLocked,retainedShop:p.retainShop}])),
  odds:shopOdds(campaign.player.level),result:campaign.result,
  airGold:{...battle.goldEarned},
  traits:Object.fromEntries(['azure','ember'].map(team=>[team,battle.traits?.teams[team]||campaign.traits(team)])),
  units:battle.units.map(u=>({id:u.id,type:u.type,stars:u.stars,team:u.team,x:u.x,y:u.y,hp:u.hp,maxHp:u.maxHp,shield:u.shield,eliminated:!!u.eliminated,swept:!!u.sweptBy,goldenShield:!!battle.traits?.isGolden(u),basicAttacks:u.basicAttacks,attackDamage:u.attackDamage,damageType:u.damageType,attackInterval:ARCHETYPES[u.type].attackTicks/10}))
});
function say(message,error=false){$('#notice').textContent=message;$('#notice').classList.toggle('error',error);if($('#shop-dialog').open){$('#shop-feedback').textContent=message;$('#shop-feedback').classList.toggle('error',error);}}
function perform(action){try{const value=action();battle=campaign.battle;render();return value??true;}catch(error){say(error.message,true);return false;}}

for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const tile=document.createElement('button');
  tile.className='tile '+(y<4?'enemy-tile':'home-tile')+(y===3?' frontline':'')+(y===4?' home-frontline':'');
  tile.innerHTML='<span class="coordinate">'+coordinate(x,y)+'</span>';
  tile.dataset.x=x;tile.dataset.y=y;tile.onclick=()=>tileAction(x,y);
  tile.onkeydown=event=>{
    const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8};
    if(offsets[event.key]){event.preventDefault();tiles[y*8+x+offsets[event.key]]?.focus();}
    if(event.code==='Space'){event.preventDefault();startOrPause();}
  };
  tiles.push(tile);board.append(tile);
}
for(let i=0;i<BENCH_SIZE;i++){
  const tile=document.createElement('button');tile.className='bench-slot';tile.dataset.x=i;tile.dataset.y=8;
  tile.onclick=()=>tileAction(i,8);benchTiles.push(tile);$('#bench').append(tile);
}
const dragging=attachBoardDrag({
  board:$('#formation-surface'),
  getChampion:(x,y)=>{const u=atPosition(x,y);return editable()&&u?.team==='azure'?u:null;},
  getView:id=>{const u=owned(id);return u?.position.bench!==undefined?benchTiles[u.position.bench].querySelector('.bench-art'):views.get(id);},
  onTap:tileAction,
  onStart:id=>{draggedId=id;selection={id};render();say('Drop on a tile to move, a teammate to swap, or the sell area for gold.');},
  onEnd:()=>{draggedId=null;renderBench();},
  onSell:sellUnit,
  onDrop:(id,x,y)=>perform(()=>{const other=campaign.move(id,y===8?{bench:x}:{x,y});selection={id};say(other?'Champions swapped.':ARCHETYPES[owned(id).type].name+' moved to '+coordinate(x,y)+'.');}),
  onCancel:()=>{say('Drag cancelled. Your formation is unchanged.');render();}
});
function tileAction(x,y){
  perform(()=>{
    const u=atPosition(x,y);
    selection=u?{id:u.id}:null;
    say(u?.team==='azure'?'Drag to move, swap, or sell.':u?'Scouting Ember’s formation.':'Drag a champion here to deploy.');
  });
}
function buy(slot){return perform(()=>{dragging.cancel();const u=campaign.buy(slot);selection={id:u.id};say(u.stars>1?ARCHETYPES[u.type].name+' combined to '+u.stars+' stars!':ARCHETYPES[u.type].name+' joined your bench. Drag to deploy, or start battle to auto-deploy.');});}
function refresh(){return perform(()=>{dragging.cancel();campaign.refresh();say('Shop refreshed. Spent 2 gold.');});}
function setShopLock(locked){return perform(()=>{campaign.setShopLocked(locked);say(locked?'Offers locked for next round. The lock resets at round end.':'Shop unlocked. New offers arrive next round.');});}
function openShop(){if(!editable())return;dragging.cancel();$('#shop-feedback').textContent='Recruit to your bench. Close the shop to place champions.';$('#shop-feedback').classList.remove('error');$('#shop-dialog').showModal();}
function levelUp(){return perform(()=>{campaign.levelUp();say('Level '+campaign.player.level+'! One more board slot. Your next shop uses the new odds.');});}
function sellUnit(id){return perform(()=>{
  const unit=owned(id);if(!unit)throw new Error('Select one of your champions to sell.');
  const champion=ARCHETYPES[unit.type],price=sellValue(unit);dragging.cancel();campaign.sell(id);selection=null;
  say(champion.name+' sold for '+price+' gold.');
});}

function renderShop(){
  const p=campaign.player,editing=editable();
  const key=JSON.stringify([p.shop,p.gold,editing,p.roster.map(u=>[u.type,u.stars,u.position])]);
  if(key!==shopKey){
    shopKey=key;
    $('#champion-cards').innerHTML=p.shop.map((type,slot)=>{
      if(!type)return '<div class="shop-empty" aria-label="Empty shop slot '+(slot+1)+'"><span>—</span>No offer</div>';
      const c=ARCHETYPES[type],disabled=!campaign.canBuy(slot),plan=campaign.purchasePlan(type);
      const combines=plan.upgrades.length?' · Combines to '+plan.unit.stars+' stars':'';
      return '<button class="champion-card element-'+c.element+' cost-tier-'+c.cost+'" data-slot="'+slot+'" '+(disabled?'disabled':'')+' aria-label="Buy '+c.name+', '+c.cost+' gold, '+c.traits.join(' and ')+combines+'"><span class="card-art has-art art-'+c.combatRole+'"></span><span class="card-content"><span class="card-title">'+c.name+'</span><span class="card-role">'+ELEMENT_LABELS[c.element]+'</span><span class="card-class">'+(c.sideTrait?ROLES[c.sideTrait].name:'Legendary')+'</span>'+(combines?'<span class="combine-hint">Combine '+starLabel(plan.unit)+'</span>':'')+'</span><span class="cost-badge cost-'+c.cost+'">'+c.cost+' gold</span></button>';
    }).join('');
    document.querySelectorAll('[data-slot]').forEach(card=>card.onclick=()=>buy(Number(card.dataset.slot)));
  }
  $('#refresh-button').disabled=!editing||p.gold<2;
  $('#shop-button').disabled=!editing;$('#board-shop-gold').textContent=p.gold+'g';$('#board-shop-lock').hidden=!p.shopLocked;
  $('#shop-gold').textContent=p.gold+' gold';$('#shop-lock').disabled=!editing;
  $('#shop-lock').setAttribute('aria-pressed',String(p.shopLocked));$('#shop-lock-label').textContent=p.shopLocked?'Locked · Next round':'Lock next round';
  $('#shop-caption').textContent=editing?(p.shopLocked?'These offers will stay for the next round. Lock resets at round end.':'Free new offers next round. Lock to keep these cards.'):'Shop reopens next round.';
  if(!editing&&$('#shop-dialog').open)$('#shop-dialog').close();
  $('#odds-label').textContent='Level '+p.level+' roll odds';
  $('#shop-odds').innerHTML=shopOdds(p.level).map((percent,i)=>'<span class="cost-'+(i+1)+'" title="'+(i+1)+' cost champions: '+percent+'%"><b>'+(i+1)+'</b> '+percent+'%</span>').join('');
}
function renderBench(){
  for(let i=0;i<BENCH_SIZE;i++){
    const tile=benchTiles[i],u=campaign.bench().find(v=>v.position.bench===i),c=u?ARCHETYPES[u.type]:null;
    const viewKey=u?u.id+':'+u.stars:'';
    if(tile.dataset.unit!==viewKey){
      tile.dataset.unit=viewKey;
      tile.innerHTML=u?'<span class="bench-art element-'+c.element+'"><span class="card-art has-art art-'+c.combatRole+'"></span><span class="bench-stars">'+starLabel(u)+'</span><span class="bench-badge">'+c.element[0].toUpperCase()+c.cost+'</span></span>':'<span class="bench-empty">'+(i+1)+'</span>';
    }
    tile.title=u?c.name+' · '+starLabel(u)+' · '+c.traits.join(' + '):'Bench slot '+(i+1);
    tile.setAttribute('aria-label',u?'Bench '+(i+1)+', '+c.name+', '+u.stars+' stars, '+c.traits.join(' and '):'Bench '+(i+1)+', empty');
    tile.classList.toggle('selected',!!u&&selection?.id===u.id);
    tile.classList.toggle('draggable',!!u&&editable());
  }
  $('#bench-count').textContent=campaign.bench().length+' / '+BENCH_SIZE;
  const unit=owned(draggedId),sell=$('#sell-zone');
  sell.setAttribute('aria-disabled',String(!editable()));
  sell.classList.toggle('sell-ready',!!unit&&editable());
  $('#sell-label').textContent=!editable()?'Sell during preparation':unit?'Drop here · +'+sellValue(unit)+' gold':'Drag here to sell';
  $('#sell-caption').textContent=unit?ARCHETYPES[unit.type].name+' '+starLabel(unit):'Board or bench champion';
}
function renderTraits(){
  const traits=battle.traits?.teams.azure||campaign.traits();
  traitHud.render(traits,battle.units,views,editable(),battle.traits?.teams.ember||campaign.traits('ember'));
}
function renderScouting(){
  const p=campaign.opponent,traits=battle.traits?.teams.ember||campaign.traits('ember');
  const scout=scoutOpponent(p.roster,traits,battle.units.filter(u=>u.team==='ember'));
  const key=JSON.stringify([p.level,p.gold,scout]);if(key===scoutingKey)return;scoutingKey=key;
  const active=scout.elements.filter(t=>t.tier).map(t=>`${t.name} ${t.count}${t.max?' MAX':''}`);
  $('#bot-plan').textContent=(active.join(' · ')||'No active elemental traits')+`. ${scout.frontline} melee / ${scout.ranged} ranged · ${scout.upgraded} upgraded.`;
  $('#scout-summary').textContent=`Level ${p.level} · ${scout.champions.length} deployed · ${p.gold} gold`;
  $('#scout-traits').innerHTML=scout.elements.map(t=>`<span class="scout-trait element-${t.element}${t.tier?' active':''}">${traitIcon(t.element)}<span>${t.name} ${t.count}<small>${t.max?'MAX active':t.tier?'Tier '+t.tier+' active':'Inactive'}${!t.max&&t.next?' · next '+t.next:''}</small></span></span>`).join('')||'<p>No elemental traits on the board.</p>';
  $('#scout-threat').textContent=scout.threat?`Highest basic DPS: ${scout.threat.name} ${starLabel(scout.threat)} · ${Math.round(scout.threat.attack/scout.threat.seconds)}/s`:'No enemies remaining on the board.';
  $('#scout-roster').innerHTML=scout.champions.map(c=>`<div class="scout-card element-${c.element}"><span class="scout-avatar"><span class="card-art has-art art-${c.role}"></span></span><div><strong>${c.name} <em>${starLabel(c)}</em></strong><small>${ROLES[c.role].name} · Cost ${c.cost} · ${c.status==='OUT'?'':coordinate(c.x,c.y)+' · '}${c.status}</small><span>${Math.ceil(c.hp)}/${Math.ceil(c.maxHp)} HP · ${Math.round(c.attack)} ATK · ${c.seconds}s</span></div></div>`).join('');
}
function openScout(){
  dragging.cancel();resumeAfterScout=campaign.phase==='combat'&&!paused;
  if(resumeAfterScout)paused=true;render();$('#scout-dialog').showModal();
}
function renderHazards(){
  const fx=battle.traits;if(!fx){$('#trait-effects').replaceChildren();return;}
  const tick=battle.tick+(paused||battle.phase==='finished'?0:battle.accumulator*10);
  let html='';
  for(const m of fx.meteors){
    if(tick<m.launchTick||tick>m.impactTick+5)continue;
    const p=Math.min(1,(tick-m.launchTick)/(m.impactTick-m.launchTick));
    if(!m.impacted)html+=`<div class="meteor-target" style="left:${m.x*12.5+6.25}%;top:${m.y*12.5+6.25}%"></div><div class="meteor" style="left:${(m.x-1.5*(1-p))*12.5+6.25}%;top:${(-2+(m.y+2)*p)*12.5+6.25}%"></div>`;
    else html+=`<div class="meteor-blast" style="left:${m.x*12.5+6.25}%;top:${m.y*12.5+6.25}%;opacity:${Math.max(0,1-(tick-m.impactTick)/5)}"></div>`;
  }
  for(const w of fx.waves)if(battle.phase==='combat'&&!w.completed&&tick<=w.endTick){const p=Math.min(1,(tick-w.startTick)/(w.endTick-w.startTick));html+=`<div class="tsunami-wave" style="left:${p*100}%"><span>TSUNAMI</span></div>`;}
  for(const w of fx.walls)if(fx.wallActive(w))html+=`<div class="wind-wall ${w.team}" style="top:${(w.y+.5)/battle.height*100}%"><span>${w.team==='azure'?'AZURE':'EMBER'} WIND WALL · ${Math.max(0,(w.endTick-tick)/10).toFixed(1)}s</span></div>`;
  for(const storm of fx.thunderstorms)if(storm.triggered&&tick<storm.impactTick+7)for(const u of storm.targets)html+=`<div class="thunder-strike" style="left:${u.x*12.5+6.25}%;height:${u.y*12.5+6.25}%;opacity:${1-(tick-storm.impactTick)/7}"></div>`;
  $('#trait-effects').innerHTML=html;
}


function renderSelection(){
  const own=owned(selection?.id),u=battle.units.find(v=>v.id===selection?.id),type=own?.type||u?.type,panel=$('#selection-panel');
  if(!type){panel.innerHTML='<span class="selection-kicker">FORMATION TIP</span><p>Frontline first. Rangers behind.</p><span class="tip-caption">Drag between the board and bench. Drop on a teammate to swap.</span>';return;}
  const c=championStats(type,(own||u).stars),location=u?.eliminated?'OUT':own?.position.bench!==undefined?'Bench':u?coordinate(u.x,u.y):'';
  if(u){c.hp=u.maxHp;c.damage=Math.round(u.attackDamage*100)/100;}
  panel.innerHTML='<span class="selection-kicker">'+starLabel(own||u)+' · COST '+c.cost+' · '+c.traits.map(t=>ELEMENT_LABELS[t]||ROLES[t].name).join(' + ')+'</span><p>'+c.name+' <span class="selection-coordinate">'+location+'</span></p><span class="tip-caption">'+(c.legendary?'Single trait. Fights as '+ROLES[c.combatRole].name+'. ':'')+c.description+' Attacks every '+c.attackTicks/10+'s.</span><div class="stat-row"><span>HP <strong>'+Math.ceil(u?.hp??c.hp)+'/'+c.hp+'</strong></span><span>'+(c.damageType==='true'?'TRUE DMG':'ATK')+' <strong>'+c.damage+'</strong></span><span>RANGE <strong>'+c.range+'</strong></span></div>'+(own&&editable()?'<div class="unit-actions">'+(own.position.bench===undefined?'<button id="bench-unit" class="secondary-button">To bench</button>':'')+'<button id="sell-unit" class="secondary-button">Sell · '+sellValue(own)+' gold</button></div>':'');
  const benchButton=$('#bench-unit');if(benchButton)benchButton.onclick=()=>perform(()=>{const slot=campaign.freeBench('azure');if(slot===undefined)throw new Error('Bench is full. Drag onto a bench champion to swap.');campaign.move(own.id,{bench:slot});say(c.name+' moved to the bench.');});
  const sellButton=$('#sell-unit');if(sellButton)sellButton.onclick=()=>sellUnit(own.id);
  if(u){const every=c.element==='air'?battle.traits?.teams[u.team].criticalEvery:0;panel.querySelector('.tip-caption').textContent+=(u.shield?' Shield: '+Math.ceil(u.shield)+'.':'')+(battle.traits?.isGolden(u)?' Golden immunity.':'')+(every?' Crit progress: '+u.basicAttacks%every+'/'+every+'.':'');}
}
function render(){
  battle=campaign.battle;
  if(battle.phase==='finished'&&campaign.phase==='combat'){
    const result=campaign.settle();
    if(result.loser){const hp=$('#'+(result.loser==='azure'?'player':'enemy')+'-hp');hp.classList.add('hp-hit');setTimeout(()=>hp.classList.remove('hp-hit'),900);}
  }
  resultReveal.sync(campaign.result,performance.now());
  const pendingResult=resultReveal.pending(performance.now());
  const editing=editable(),p=campaign.player,enemy=campaign.opponent;
  shell.classList.toggle('placing',editing&&!!selection);
  for(const [id,el] of views)if(!battle.units.some(u=>u.id===id)){el.remove();views.delete(id);}
  for(const u of battle.units){
    const c=ARCHETYPES[u.type];let el=views.get(u.id);
    if(!el){el=document.createElement('div');el.dataset.unitId=u.id;el.innerHTML='<span class="trait-aura" aria-hidden="true"></span><div class="unit-portrait"><span class="portrait-art"></span><span class="unit-glyph"></span></div><span class="unit-trait-mark" aria-hidden="true" hidden></span><span class="unit-stars"></span><div class="shield-track"><div class="shield-fill"></div></div><div class="health-track"><div class="health-fill"></div></div>';views.set(u.id,el);unitLayer.append(el);}
    el.className='unit has-art '+u.team+' type-'+c.combatRole+' element-'+c.element+(u.hp<=0?' dead':'')+(u.eliminated?' eliminated':'')+(selection?.id===u.id?' selected':'')+(battle.traits?.burns[u.id]?' burning':'')+(u.sweptBy?' swept':'')+(u.shield>0?' shielded':'')+(battle.traits?.isGolden(u)?' golden':'');
    el.style.left=((u.sweepX??u.x)*12.5)+'%';el.style.top=(u.y*12.5)+'%';el.style.transitionDuration=(.22/speed)+'s';
    el.querySelector('.unit-glyph').textContent=c.element[0].toUpperCase()+c.cost;
    el.querySelector('.unit-stars').textContent=starLabel(u);
    el.querySelector('.health-fill').style.width=(u.hp/u.maxHp*100)+'%';
    el.querySelector('.shield-fill').style.width=(u.maxShield?u.shield/u.maxShield*100:0)+'%';
  }
  const selected=battle.units.find(u=>u.id===selection?.id);
  tiles.forEach((tile,index)=>{
    const x=index%8,y=Math.floor(index/8),u=battle.at(x,y);
    tile.setAttribute('aria-label',coordinate(x,y)+', '+(y<4?'enemy':'your')+' territory'+(u?', '+u.team+' '+ARCHETYPES[u.type].name+', '+u.stars+' stars, '+Math.ceil(u.hp)+' health':', empty'));
    tile.title=u?ARCHETYPES[u.type].name+' '+starLabel(u)+' · '+Math.ceil(u.hp)+'/'+u.maxHp+' HP'+(u.shield?' · '+Math.ceil(u.shield)+' shield':''):coordinate(x,y);
    tile.classList.toggle('selected',!!u&&u.id===selection?.id);
    tile.classList.toggle('draggable',editing&&u?.team==='azure');
    tile.classList.toggle('in-range',!!selected&&selected.hp>0&&!selected.eliminated&&!selected.sweptBy&&distance(selected,{x,y})<=ARCHETYPES[selected.type].range);
  });
  const deployed=campaign.deployed().length,remaining=battle.living('azure').length;
  $('#player-hp').textContent=p.hp+' HP';$('#enemy-hp').textContent=enemy.hp+' HP';
  $('#player-count').textContent=editing?deployed+' / '+p.level+' deployed':remaining+' remaining · Level '+p.level;
  $('#enemy-count').textContent='Level '+enemy.level+' · '+battle.living('ember').length+' '+(editing?'deployed':'remaining');
  $('#squad-count').innerHTML=deployed+'<span>/'+p.level+'</span>';
  $('#phase-label').textContent=editing?'PREPARATION':campaign.phase==='finished'?'MATCH COMPLETE':campaign.phase==='result'?'ROUND COMPLETE':paused?'PAUSED':'IN COMBAT';
  $('#timer').textContent=String(Math.floor(battle.tick/600)).padStart(2,'0')+':'+String(Math.floor(battle.tick/10)%60).padStart(2,'0');
  $('#match-number').textContent=campaign.roundLabel;
  const label=pendingResult?'Round complete…':editing?(p.roster.length?'Start battle':'Pass round · No units'):campaign.phase==='finished'?'New match':campaign.phase==='result'?'Next round':paused?'Resume battle':'Pause battle';
  $('#start-button').innerHTML='<span>'+label+'</span><span aria-hidden="true">'+(campaign.phase==='combat'&&!paused?'Ⅱ':'↗')+'</span>';
  $('#mobile-start').innerHTML=$('#start-button').innerHTML;
  $('#start-button').disabled=$('#mobile-start').disabled=pendingResult;
  $('#mobile-status').textContent=p.gold+' gold · '+(editing?deployed+'/'+p.level+' ready':paused?'Paused':campaign.phase==='combat'?$('#timer').textContent:campaign.roundLabel);
  $('#arena-hint').textContent=editing?(deployed?'Drag to move or swap.':'Recruit, then deploy.'):'Champions return next round.';
  $('#gold-count').textContent=p.gold;$('#level-label').textContent='Level '+p.level;$('#level-caption').textContent='Deploy up to '+p.level+' champions';
  const cost=campaign.levelPrice();$('#level-button').textContent=p.level<10?'Level '+(p.level+1)+' · '+cost+'g':'Max level';
  $('#level-button').title=p.level<10?`${p.xp}/${LEVEL_COSTS[p.level]} XP. Spend ${cost} gold to reach level ${p.level+1}.`:'Maximum level reached';
  $('#level-button').setAttribute('aria-label',$('#level-button').title);
  $('#level-button').disabled=!editing||p.level===10||p.gold<cost;
  $('#xp-label').textContent=p.level<10?p.xp+' / '+LEVEL_COSTS[p.level]+' XP · +2 each round':'Maximum level reached';
  $('#xp-bar').max=LEVEL_COSTS[p.level]||1;$('#xp-bar').value=p.level<10?p.xp:1;
  const interest=Math.min(5,Math.floor(p.gold/10));
  $('#income-preview').innerHTML='<span>Next income <strong>5 base + '+interest+' interest</strong></span><span>Loss streak <strong>'+p.lossStreak+' · +'+streakBonus(p.lossStreak)+' gold</strong></span><small>Win bonus +1 · Interest caps at 50 gold</small>';
  $('#damage-preview').textContent='Stage '+campaign.stage+': the loser takes '+stageDamage(campaign.stage)+' HP damage.';
  renderShop();renderBench();renderSelection();renderTraits();renderHazards();renderScouting();
  if(resultReveal.ready(performance.now()))showResult();else $('#result').hidden=true;
}
function cleanEffects(){dragging.cancel();$('#effects').replaceChildren();$('#floaters').replaceChildren();}
function startOrPause(){perform(()=>{
  if(resultReveal.pending(performance.now()))return;
  dragging.cancel();
  if(editable()){campaign.start();paused=false;selection=null;lastTime=performance.now();say(campaign.lastAutoDeployed.length?'Auto-deployed '+campaign.lastAutoDeployed.length+' champion(s) from your bench. Battle underway.':campaign.deployed().length?'Battle underway.':'No champions owned. Ember claims this round.');tone(390,.12);}
  else if(campaign.phase==='result'){const retained=campaign.player.retainShop;cleanEffects();campaign.nextRound();selection=null;paused=false;$('#result').hidden=true;say('Round '+campaign.roundLabel+'. '+(retained?'Shop offers kept. Lock again to save them another round.':'Champions restored. Open Shop for new offers.'));}
  else if(campaign.phase==='finished')restartMatch();
  else{paused=!paused;say(paused?'Battle paused.':'Battle resumed.');}
});}
function restartMatch(){cleanEffects();traitHud.reset();campaign=new Campaign();battle=campaign.battle;selection=null;paused=false;shopKey='';$('#result').hidden=true;say('New match. Buy a champion, then drag from your bench onto the board.');}
function showResult(){
  const result=$('#result');if(!result.hidden)return;
  const r=campaign.result,won=r.outcome==='azure',draw=r.outcome==='draw',income=r.income.azure;
  result.className='result-overlay'+(won||draw?'':' loss');
  const title=r.matchOver?(won?'Match won.':'Match lost.'):draw?'Round drawn.':won?'Round won.':'Round lost.';
  const summary=draw?'No player HP lost.':(won?'Azure strikes Ember':'Ember strikes Azure')+' for '+r.damage+' HP. Your HP: '+campaign.player.hp+' · Ember: '+campaign.opponent.hp+'.';
  const xp=r.experience.azure;
  result.innerHTML='<span class="eyebrow">ROUND '+r.round+'</span><h2>'+title+'</h2><p>'+summary+'</p><div class="result-gold">+'+income.total+' gold</div><div class="result-stat">5 base + '+income.interest+' interest + '+income.win+' win + '+income.streak+' streak<br><span class="xp-reward">'+(xp.gained?'+'+xp.gained+' XP':'Max level')+(xp.levels?' · Level '+xp.level+' reached!':'')+'</span></div><button id="result-next" class="primary-button">'+(r.matchOver?'Play a new match':'Next round')+' <span>↗</span></button>';
  result.hidden=false;$('#result-next').onclick=startOrPause;
  if(r.airGold.azure)result.querySelector('.result-stat').append(document.createTextNode(' · '+r.airGold.azure+' Air gold already collected'));
  say(title+' Earned '+income.total+' gold.');tone(won?660:220,.35);
}
function effects(events){
  let played=false;
  for(const e of events){
    if(['burn','meteor','heal','ejected','thunder','gold','reflection','inheritance'].includes(e.type)){
      const u=battle.units.find(v=>v.id===e.id);if(u){const n=document.createElement('span');n.className=`damage-number effect-${e.type}`;n.textContent=e.type==='gold'?'+1 GOLD':e.type==='inheritance'?'INHERITED':e.execute?'EXECUTED':e.type==='ejected'?'OUT':`${e.type==='heal'?'+':'−'}${Math.round(e.amount)}`;n.style.left=`${Math.min(7,u.sweepX??u.x)*12.5+6.25}%`;n.style.top=`${u.y*12.5+3}%`;$('#floaters').append(n);setTimeout(()=>n.remove(),820);}continue;
    }
    if(e.type!=='attack')continue;
    const from=battle.units.find(u=>u.id===e.id),to=battle.units.find(u=>u.id===e.targetId);if(!from||!to)continue;
    const attackView=views.get(from.id),hitView=views.get(to.id);
    attackView?.classList.add('attacking');hitView?.classList.add('hit');
    setTimeout(()=>{attackView?.classList.remove('attacking');hitView?.classList.remove('hit');},140/speed);
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.classList.add('shot');
    for(const [k,v] of Object.entries({x1:from.x*100+50,y1:from.y*100+50,x2:to.x*100+50,y2:to.y*100+50,stroke:from.team==='azure'?'#b8efce':'#ee9d8d'}))line.setAttribute(k,String(v));
    $('#effects').append(line);setTimeout(()=>line.remove(),360);
    const number=document.createElement('span');number.className='damage-number'+(e.dodged?' effect-dodge':e.critical?' effect-critical':'');number.textContent=e.dodged?'DODGE':`${e.critical?'CRIT ':''}−${Math.round(e.amount)}`;number.style.left=`${to.x*12.5+6.25}%`;number.style.top=`${to.y*12.5+3}%`;$('#floaters').append(number);setTimeout(()=>number.remove(),820);
    if(!played){tone(ARCHETYPES[from.type].combatRole==='ranger'?600:160,.035);played=true;}
  }
}
function tone(frequency,duration){
  if(!sound||!audio)return;
  try{const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(Math.max(60,frequency/2),audio.currentTime+duration);gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.start();oscillator.stop(audio.currentTime+duration);}catch{/* Sound is optional; combat continues. */}
}

$('#sound-button').onclick=async()=>{
  if(!sound){try{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();sound=true;}catch{say('Sound is unavailable in this browser.');return;}}else sound=false;
  $('#sound-button').textContent=sound?'Sound on':'Sound off';$('#sound-button').setAttribute('aria-pressed',String(sound));tone(480,.08);
};
$('#start-button').onclick=startOrPause;$('#mobile-start').onclick=startOrPause;
$('#refresh-button').onclick=refresh;$('#level-button').onclick=levelUp;
$('#shop-button').onclick=openShop;
$('#scout-button').onclick=$('#scout-details-button').onclick=openScout;
$('#close-scout').onclick=()=>$('#scout-dialog').close();
$('#scout-dialog').addEventListener('close',()=>{
  if(resumeAfterScout&&campaign.phase==='combat'&&!document.hidden){paused=false;lastTime=performance.now();render();}
  resumeAfterScout=false;
});
$('#shop-lock').onclick=()=>setShopLock(!campaign.player.shopLocked);
$('#close-shop').onclick=$('#done-shop').onclick=()=>$('#shop-dialog').close();
$('#shop-dialog').addEventListener('click',event=>{if(event.target===$('#shop-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
$('#new-match').onclick=()=>{if(campaign.phase==='combat'){paused=true;render();}$('#restart-dialog').showModal();};
$('#cancel-restart').onclick=()=>$('#restart-dialog').close();
$('#confirm-restart').onclick=()=>{$('#restart-dialog').close();perform(restartMatch);};
document.querySelectorAll('[data-speed]').forEach(button=>button.onclick=()=>{
  speed=Number(button.dataset.speed);document.querySelectorAll('[data-speed]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});render();
});
$('#help-button').onclick=()=>{if(campaign.phase==='combat'&&!paused){paused=true;say('Battle paused while you read the field guide.');render();}$('#help-dialog').showModal();};
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>$('#help-dialog').close());
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#help-dialog').open&&!$('#trait-dialog').open&&!$('#shop-dialog').open){selection=null;render();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&campaign.phase==='combat'&&!paused){paused=true;say('Battle paused while you were away.');render();}lastTime=performance.now();});
function frame(now){
  const dt=Math.min(.1,Math.max(0,(now-(lastTime||now))/1000));lastTime=now;
  if(campaign.phase==='combat'&&!paused){const previous=battle.tick;battle.advance(dt*speed);if(battle.tick!==previous){render();effects(battle.drainEvents());}}
  if(campaign.phase==='combat')renderHazards();
  if(campaign.result&&$('#result').hidden&&resultReveal.ready(now))render();
  requestAnimationFrame(frame);
}
render();requestAnimationFrame(frame);
registerGameTools({
  snapshot,catalog:()=>Object.values(SHOP_CHAMPIONS).map(c=>({id:c.id,name:c.name,cost:c.cost,traits:c.traits,combatRole:c.combatRole,hp:c.hp,damage:c.damage,damageType:c.damageType,attackInterval:c.attackTicks/10})),
  buy:slot=>{campaign.buy(slot);render();return snapshot();},
  refresh:()=>{campaign.refresh();render();return snapshot();},
  lock:locked=>{campaign.setShopLocked(locked);render();return snapshot();},
  levelUp:()=>{campaign.levelUp();render();return snapshot();},
  move:(id,position)=>{dragging.cancel();campaign.move(id,position);render();return snapshot();},
  start:()=>{dragging.cancel();campaign.start();paused=false;selection=null;lastTime=performance.now();render();return snapshot();},
  next:()=>{if(resultReveal.pending(performance.now()))throw new Error('Wait for the round result.');campaign.nextRound();paused=false;selection=null;render();return snapshot();}
});

