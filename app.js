import { distance } from './engine.js';
import { CHAMPIONS as ARCHETYPES, SHOP_CHAMPIONS, ARCHETYPES as ROLES, ELEMENT_LABELS, championStats, sellValue, teamTraits } from './catalog.js';
import { BENCH_SIZE, shopOdds } from './campaign.js';
import { League, LEVEL_COSTS, stageDamage, streakBonus } from './league.js';
import { registerGameTools } from './webmcp.js';
import { attachBoardDrag } from './drag.js';
import { createTraitHud,traitIcon } from './trait-ui.js';
import { ResultReveal,scoutOpponent } from './ui-state.js';
import { Sandbox } from './sandbox.js';

const $=selector=>document.querySelector(selector);
const board=$('#board'),unitLayer=$('#units'),shell=$('.board-shell');
let campaign=new League(),battle=campaign.battle,selection=null,paused=false,speed=1;
let fightCampaign=campaign,sandboxCampaign=null;
const isSandbox=()=>campaign.mode==='sandbox';
let lastTime=0,sound=false,audio=null,shopKey='',draggedId=null;
const tiles=[],views=new Map(),benchTiles=[];
const resultReveal=new ResultReveal();
let scoutingKey='',resumeAfterScout=false;
let resumeAfterTrait=false,seenPreparation=0,standingsKey='',selectionKey='',lastViewBattle=null,uiElapsed=0;
const sideTraits=team=>battle.traits?.teams[team]||teamTraits(battle.units.filter(u=>u.team===team),battle.catalog);
const traitHud=createTraitHud({rail:$('#trait-list'),dialog:$('#trait-dialog'),ambience:$('#territory-ambience'),enemyAmbience:$('#enemy-territory-ambience'),
  onOpen:()=>{resumeAfterTrait=isSandbox()&&campaign.phase==='combat'&&!paused;if(resumeAfterTrait){paused=true;render();}},
  onClose:()=>{if(resumeAfterTrait&&campaign.phase==='combat'&&!document.hidden){paused=false;lastTime=performance.now();render();}resumeAfterTrait=false;}
});
const coordinate=(x,y)=>y===8?'Bench '+(x+1):String.fromCharCode(65+x)+(8-y);
const starLabel=u=>'★'.repeat(u.stars||1);
const roleMarker=c=>['support','assassin'].includes(c.combatRole)?`<span class="role-mark" title="${ROLES[c.combatRole].name}">${traitIcon(c.combatRole)}</span>`:'';
const editable=()=>campaign.phase==='preparation'&&(isSandbox()||(campaign.player.hp>0&&campaign.viewId==='azure'));
const trading=()=>isSandbox()?editable():campaign.canTrade();
const visibleBench=()=>campaign.bench(isSandbox()?'azure':campaign.viewId);
const inspected=id=>isSandbox()?campaign.unit(id):campaign.players[campaign.viewId].roster.find(u=>u.id===id)||owned(id);
const homeView=()=>isSandbox()||campaign.viewId==='azure';
const playbackSpeed=()=>isSandbox()?speed:campaign.combatSpeed;
const shopLocked=()=>campaign.player.shopLocked||campaign.player.retainShop;
let sellKey='';
const owned=id=>isSandbox()?campaign.unit(id):campaign.player.roster.find(u=>u.id===id);
const atPosition=(x,y)=>y===8?visibleBench().find(u=>u.position.bench===x):battle.at(x,y);
const snapshot=()=>({
  mode:isSandbox()?'sandbox':'fight',phase:campaign.phase,round:campaign.roundLabel,paused,outcome:battle.outcome,seconds:battle.tick/10,
  players:Object.fromEntries(Object.entries(campaign.players).map(([team,p])=>[team,{hp:p.hp,gold:team==='azure'||isSandbox()?p.gold:undefined,level:p.level,xp:team==='azure'||isSandbox()?p.xp:undefined,levelPrice:team==='azure'||isSandbox()?campaign.levelPrice(team):undefined,lossStreak:p.lossStreak,roster:p.roster,shop:team==='azure'?p.shop:undefined,shopLocked:team==='azure'?p.shopLocked:undefined,retainedShop:team==='azure'?p.retainShop:undefined}])),
  odds:shopOdds(campaign.player.level),result:campaign.result,
  airGold:{...battle.goldEarned},
  traits:Object.fromEntries(['azure','ember'].map(team=>[team,sideTraits(team)])),
  units:battle.units.map(u=>({id:u.id,type:u.type,stars:u.stars,team:u.team,x:u.x,y:u.y,hp:u.hp,maxHp:u.maxHp,shield:u.shield,eliminated:!!u.eliminated,swept:!!u.sweptBy,goldenShield:!!battle.traits?.isGolden(u),basicAttacks:u.basicAttacks,attackDamage:u.attackDamage,damageType:u.damageType,attackInterval:battle.attackInterval(u)/10,range:battle.attackRange(u),attackSpeedBonus:u.attackSpeedBonus||0}))
});
function say(message,error=false){$('#notice').textContent=message;$('#notice').classList.toggle('error',error);for(const prefix of ['shop','sandbox'])if($('#'+prefix+'-dialog').open){$('#'+prefix+'-feedback').textContent=message;$('#'+prefix+'-feedback').classList.toggle('error',error);}}
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
  getChampion:(x,y)=>{const u=atPosition(x,y);return trading()&&homeView()&&u&&owned(u.id)?u:null;},
  canDrop:(id,x,y)=>editable()&&(isSandbox()?campaign.validPosition(owned(id)?.team,{x,y}):y>=4),
  getView:id=>{const u=owned(id);return u?.position.bench!==undefined?benchTiles[u.position.bench].querySelector('.bench-art'):views.get(id);},
  onTap:tileAction,
  onStart:id=>{draggedId=id;selection={id};render();say(isSandbox()?'Drag within this team’s half, swap with a teammate, or drop in Remove.':'Drop on a tile to move, a teammate to swap, or the sell area for gold.');},
  onEnd:()=>{draggedId=null;renderBench();},
  onSell:sellUnit,
  onDrop:(id,x,y)=>perform(()=>{const other=campaign.move(id,y===8?{bench:x}:{x,y});selection={id};say(other?'Champions swapped.':ARCHETYPES[owned(id).type].name+' moved to '+coordinate(x,y)+'.');}),
  onCancel:()=>{say('Drag cancelled. Your formation is unchanged.');render();}
});
function tileAction(x,y){
  perform(()=>{
    const u=atPosition(x,y);
    selection=u?{id:u.id,roster:y===8}:null;
    say(isSandbox()?(u?'Drag to position or choose its stars below the board.':'Use Champions to add to either side.'):u?.team==='azure'?'Drag to move, swap, or sell.':u?'Inspecting this company’s formation.':'Drag a champion here to deploy.');
  });
}
function buy(slot){return perform(()=>{dragging.cancel();const u=campaign.buy(slot);selection={id:u.id,roster:true};say(u.stars>1?battle.catalog[u.type].name+' combined to '+u.stars+' stars!':battle.catalog[u.type].name+' joined your roster. Deploy during preparation.');});}
function refresh(){return perform(()=>{dragging.cancel();campaign.refresh();say('Shop refreshed. Spent 2 gold.');});}
function setShopLock(locked){return perform(()=>{campaign.setShopLocked(locked);say(locked?'Offers locked for next round. The lock resets at round end.':'Shop unlocked. New offers arrive next round.');});}
function openShop(){if(!trading())return;dragging.cancel();if(isSandbox()){renderSandboxCatalog();$('#sandbox-dialog').showModal();return;}$('#shop-feedback').textContent=editable()?'Recruit to your bench. Close the shop to place champions.':'Your shop · Changes apply to your next lineup.';$('#shop-feedback').classList.remove('error');$('#shop-dialog').showModal();}
function levelUp(){return perform(()=>{campaign.levelUp();say('Level '+campaign.player.level+'! One more board slot. Your next shop uses the new odds.');});}
function sellUnit(id){return perform(()=>{
  const unit=owned(id);if(!unit)throw new Error('Select one of your champions to sell.');
  const champion=ARCHETYPES[unit.type],price=sellValue(unit);dragging.cancel();campaign.sell(id);selection=null;
  say(champion.name+(isSandbox()?' removed.':' sold for '+price+' gold.'));
});}

function switchMode(mode){
  if(!['fight','sandbox'].includes(mode))return;
  cleanEffects();resumeAfterScout=false;resumeAfterTrait=false;
  delete $('#result').dataset.league;selectionKey='';
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  campaign=mode==='sandbox'?(sandboxCampaign??=new Sandbox()):fightCampaign;
  battle=campaign.battle;paused=isSandbox()&&campaign.phase==='combat';selection=null;draggedId=null;
  shopKey='';scoutingKey='';traitHud.reset();resultReveal.sync(null,performance.now());$('#result').hidden=true;
  lastTime=performance.now();render();
  say(isSandbox()?'Choose Champions to build both teams. Drag to position; click a unit to change its stars.':paused?'Fight match restored.':'Fight match restored.');
}
function renderSandboxCatalog(){
  const team=$('#sandbox-team').value,stars=Number($('#sandbox-stars').value),element=$('#sandbox-element').value,cost=$('#sandbox-cost').value;
  const count=campaign.deployed(team).length;
  $('#sandbox-capacity').textContent=(team==='azure'?'Azure':'Ember')+' · '+count+'/10 placed · '+stars+'★ · Free';
  $('#sandbox-catalog').innerHTML=campaign.availableChampions(team).filter(c=>(element==='all'||c.element===element)&&(cost==='all'||c.cost===Number(cost))).sort((a,b)=>a.cost-b.cost||a.name.localeCompare(b.name)).map(c=>{
    const stats=championStats(c.id,stars);
    return `<button class="sandbox-card element-${c.element}" data-sandbox-type="${c.id}" ${count>=10?'disabled':''} aria-label="Add ${c.name}, ${stars} stars, to ${team}"><strong>${c.name}</strong><span>${ELEMENT_LABELS[c.element]} · ${c.sideTrait?ROLES[c.sideTrait].name:'Legendary'} · Cost ${c.cost}</span><small>${Math.round(stats.hp)} HP · ${Math.round(stats.damage)} ATK</small></button>`;
  }).join('')||'<p class="sandbox-empty">All matching champions are already on this team. Change filters or remove one from the board.</p>';
  $('#sandbox-catalog').querySelectorAll('[data-sandbox-type]').forEach(button=>button.onclick=()=>perform(()=>{
    const unit=campaign.add(button.dataset.sandboxType,team,stars);selection={id:unit.id};
    say(ARCHETYPES[unit.type].name+' '+starLabel(unit)+' added to '+(team==='azure'?'Azure':'Ember')+'.');renderSandboxCatalog();
  }));
}
function resetSandbox(){return perform(()=>{
  if(!isSandbox()||resultReveal.pending(performance.now()))return;
  cleanEffects();campaign.reset();selection=null;paused=false;traitHud.reset();$('#result').hidden=true;
  say('Both formations restored. Edit or start another battle.');
});}
function renderSandbox(){
  const active=isSandbox(),unit=owned(selection?.id);
  document.body.classList.toggle('sandbox-game',active);$('#game-mode').value=active?'sandbox':'fight';
  $('#sandbox-tools').hidden=$('#sandbox-summary').hidden=!active;
  $('#round-label').textContent=active?'TEST':'ROUND';
  $('#shop-button>span').textContent=active?'Champions':'Shop';
  $('#new-match').textContent=active?'Clear formations':'Start a new match';
  $('#new-match').disabled=active&&!editable();
  if(!active)return;
  $('#standings-panel').hidden=true;$('#faceoff-countdown').hidden=true;$('#return-home').hidden=true;$('#round-recap').hidden=true;$('#view-caption').textContent='Build both teams';$('#enemy-name').textContent='Ember company';$('#friendly-name').textContent='Azure company · You';$('#territory-label').textContent='YOUR TERRITORY';
  if(!editable()&&$('#sandbox-dialog').open)$('#sandbox-dialog').close();
  $('#level-button').textContent='Level 10';$('#level-button').title='Both teams can place up to 10 champions.';
  $('#level-button').setAttribute('aria-label',$('#level-button').title);
  $('#sandbox-selected').textContent=unit?(unit.team==='azure'?'Azure · ':'Ember · ')+ARCHETYPES[unit.type].name:'Select a champion to edit stars.';
  $('#sandbox-unit-stars').disabled=!editable()||!unit;$('#sandbox-unit-stars').value=String(unit?.stars||1);
  $('#sandbox-reset').disabled=editable()||resultReveal.pending(performance.now());
  $('#damage-preview').textContent='Player HP is disabled.';
}

function renderShop(){
  const p=campaign.player,editing=trading(),locked=shopLocked();
  if(isSandbox()){$('#shop-button').disabled=!editing;$('#board-shop-lock').hidden=true;return;}
  const key=JSON.stringify([p.shop,p.gold,editing,p.roster.map(u=>[u.type,u.stars,u.position])]);
  if(key!==shopKey){
    shopKey=key;
    $('#champion-cards').innerHTML=p.shop.map((type,slot)=>{
      if(!type)return '<div class="shop-empty" aria-label="Empty shop slot '+(slot+1)+'"><span>—</span>No offer</div>';
      const c=ARCHETYPES[type],disabled=!campaign.canBuy(slot),plan=campaign.purchasePlan(type);
      const combines=plan.upgrades.length?' · Combines to '+plan.unit.stars+' stars':'';
      return '<button class="champion-card element-'+c.element+' cost-tier-'+c.cost+'" data-slot="'+slot+'" '+(disabled?'disabled':'')+' aria-label="Buy '+c.name+', '+c.cost+' gold, '+c.traits.join(' and ')+combines+'"><span class="card-art has-art art-'+c.combatRole+'">'+roleMarker(c)+'</span><span class="card-content"><span class="card-title">'+c.name+'</span><span class="card-role">'+ELEMENT_LABELS[c.element]+'</span><span class="card-class">'+(c.sideTrait?ROLES[c.sideTrait].name:'Legendary')+'</span>'+(combines?'<span class="combine-hint">Combine '+starLabel(plan.unit)+'</span>':'')+'</span><span class="cost-badge cost-'+c.cost+'">'+c.cost+' gold</span></button>';
    }).join('');
    document.querySelectorAll('[data-slot]').forEach(card=>card.onclick=()=>buy(Number(card.dataset.slot)));
  }
  $('#refresh-button').disabled=!editing||p.gold<2;
  $('#shop-button').disabled=!editing;$('#board-shop-gold').textContent=p.gold+'g';$('#board-shop-lock').hidden=!locked;
  $('#shop-gold').textContent=p.gold+' gold';$('#shop-lock').disabled=!editing;
  $('#shop-lock').setAttribute('aria-pressed',String(locked));$('#shop-lock-label').textContent=locked?'Locked · Next round':'Lock next round';
  $('#shop-caption').textContent=editing?(locked?'These offers will stay for the next round. Lock resets at round end.':'Free new offers next round. Lock to keep these cards.'):'Start a game to recruit.';
  if(!editing&&$('#shop-dialog').open)$('#shop-dialog').close();
  $('#odds-label').textContent='Level '+p.level+' roll odds';
  $('#shop-odds').innerHTML=shopOdds(p.level).map((percent,i)=>'<span class="cost-'+(i+1)+'" title="'+(i+1)+' cost champions: '+percent+'%"><b>'+(i+1)+'</b> '+percent+'%</span>').join('');
}
function renderBench(){
  for(let i=0;i<BENCH_SIZE;i++){
    const tile=benchTiles[i],u=visibleBench().find(v=>v.position.bench===i),c=u?ARCHETYPES[u.type]:null;
    const viewKey=u?u.id+':'+u.type+':'+u.stars:'';
    if(tile.dataset.unit!==viewKey){
      tile.dataset.unit=viewKey;
      tile.innerHTML=u?'<span class="bench-art element-'+c.element+'"><span class="card-art has-art art-'+c.combatRole+'">'+roleMarker(c)+'</span><span class="bench-stars">'+starLabel(u)+'</span><span class="bench-badge">'+c.element[0].toUpperCase()+c.cost+'</span></span>':'<span class="bench-empty">'+(i+1)+'</span>';
    }
    tile.title=u?c.name+' · '+starLabel(u)+' · '+c.traits.join(' + '):'Bench slot '+(i+1);
    tile.setAttribute('aria-label',u?'Bench '+(i+1)+', '+c.name+', '+u.stars+' stars, '+c.traits.join(' and '):'Bench '+(i+1)+', empty');
    tile.classList.toggle('selected',!!u&&selection?.id===u.id);
    tile.classList.toggle('draggable',!!u&&trading()&&homeView());
  }
  $('#bench-count').textContent=visibleBench().length+' / '+BENCH_SIZE;
  $('#bench-owner').textContent=isSandbox()||homeView()?'Bench':campaign.players[campaign.viewId].name+'’s bench';
  $('.bench-panel').setAttribute('aria-label',homeView()?'Your bench':campaign.players[campaign.viewId].name+' bench, read-only');
  const unit=owned(draggedId),sell=$('#sell-zone');
  sell.setAttribute('aria-disabled',String(!trading()));
  sell.classList.toggle('sell-ready',!!unit&&trading());
  $('#sell-label').textContent=!trading()?'Sell champions':unit?'Drop here · +'+sellValue(unit)+' gold':'Drag or click to sell';
  $('#sell-caption').textContent=unit?ARCHETYPES[unit.type].name+' '+starLabel(unit):homeView()?'Your board or bench champions':'Manage your own champions';
  if(isSandbox()){
    $('#bench-count').textContent='10 champions per side';
    $('#sell-label').textContent=!editable()?'Remove during setup':unit?'Drop to remove':'Drag here to remove';
    $('#sell-caption').textContent=unit?ARCHETYPES[unit.type].name+' '+starLabel(unit):'Either team';
  }
}
function openSellDialog(){
  if(isSandbox()||!trading())return;
  dragging.cancel();sellKey='';$('#sell-dialog').showModal();renderSellDialog();
}
function renderSellDialog(){
  if(!$('#sell-dialog').open)return;
  if(isSandbox()||!trading()){$('#sell-dialog').close();return;}
  const roster=campaign.player.roster,key=JSON.stringify([campaign.phase,roster]);
  if(key===sellKey)return;sellKey=key;
  $('#sell-roster').innerHTML=roster.map(u=>{const c=ARCHETYPES[u.type];return `<button class="sell-card" data-sell-id="${u.id}"><span><strong>${c.name} ${starLabel(u)}</strong><small>${u.position.bench!==undefined?'Bench':'Board'} · ${ELEMENT_LABELS[c.element]} · ${ROLES[c.combatRole].name}</small></span><b>Sell · ${sellValue(u)}g</b></button>`}).join('')||'<p>No champions to sell.</p>';
  $('#sell-roster').querySelectorAll('[data-sell-id]').forEach(button=>button.onclick=()=>sellUnit(Number(button.dataset.sellId)));
  $('#sell-info').textContent=campaign.phase==='preparation'?'Your roster · Sell for the full invested cost.':'Sales update your next lineup. Champions already in this battle finish fighting.';
}
function renderTraits(){
  traitHud.render(sideTraits('azure'),battle.units,views,campaign.phase==='preparation',sideTraits('ember'));
}
function renderScouting(){
  let p=campaign.opponent,scoutedBattle=battle,side='ember';
  if(!isSandbox()){
    const view=campaign.view();
    const selected=view.watching?view.viewed:campaign.phase==='preparation'?campaign.opponentFor('azure'):null;
    if(selected){
      p=selected;const match=campaign.matchFor(p.team);
      scoutedBattle=match?.battle||campaign.previewFor(p.team);
      side=match&&match.emberId===p.team&&!match.ghost?'ember':'azure';
    }
  }
  const units=scoutedBattle.units.filter(u=>u.team===side),traits=scoutedBattle.traits?.teams[side]||teamTraits(units,scoutedBattle.catalog);
  const scout=scoutOpponent(units.map(u=>({...u,position:{x:u.x,y:u.y}})),traits,units.map(u=>({...u,effectiveAttackTicks:scoutedBattle.attackInterval(u),effectiveRange:scoutedBattle.attackRange(u)})),scoutedBattle.catalog);
  const key=JSON.stringify([p.name,p.level,scout]);if(key===scoutingKey)return;scoutingKey=key;
  const allTraits=[...scout.elements,...scout.classes],active=allTraits.filter(t=>t.tier).map(t=>`${t.name} ${t.count}${t.max?' MAX':''}`);
  $('#bot-plan').textContent=(active.join(' · ')||'No active traits')+`. ${scout.frontline} melee / ${scout.ranged} ranged · ${scout.upgraded} upgraded.`;
  $('#scout-title').textContent=p.name||'Ember company';
  $('#scout-summary').textContent=`Level ${p.level} · ${scout.champions.length} deployed`+(isSandbox()?' · Your custom formation':' · Scoutable board only');
  $('#scout-traits').innerHTML=allTraits.map(t=>`<span class="scout-trait element-${t.element}${t.tier?' active':''}">${traitIcon(t.element)}<span>${t.name} ${t.count}<small>${t.max?'MAX active':t.tier?'Tier '+t.tier+' active':'Inactive'}${!t.max&&t.next?' · next '+t.next:''}</small></span></span>`).join('')||'<p>No traits on the board.</p>';
  $('#scout-threat').textContent=scout.threat?`Highest basic DPS: ${scout.threat.name} ${starLabel(scout.threat)} · ${Math.round(scout.threat.attack/scout.threat.seconds)}/s`:'No enemies remaining on the board.';
  $('#scout-roster').innerHTML=scout.champions.map(c=>`<div class="scout-card element-${c.element}"><span class="scout-avatar"><span class="card-art has-art art-${c.role}">${roleMarker({combatRole:c.role})}</span></span><div><strong>${c.name} <em>${starLabel(c)}</em></strong><small>${ROLES[c.role]?.name||'Monster'} · Cost ${c.cost} · ${c.status==='OUT'?'':coordinate(c.x,c.y)+' · '}${c.status}</small><span>${Math.ceil(c.hp)}/${Math.ceil(c.maxHp)} HP · ${Math.round(c.attack)} ATK · ${Number(c.seconds.toFixed(3))}s · ${c.range} range</span></div></div>`).join('');
}
function openScout(){
  dragging.cancel();resumeAfterScout=isSandbox()&&campaign.phase==='combat'&&!paused;
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
  const own=owned(selection?.id),record=inspected(selection?.id),u=selection?.roster?null:battle.units.find(v=>v.id===selection?.id),type=u?.type||record?.type,panel=$('#selection-panel');
  const nextKey=JSON.stringify([isSandbox(),editable(),trading(),selection?.id,selection?.roster,type,record?.stars,record?.position,u&&[u.stars,u.x,u.y,u.hp,u.maxHp,u.attackDamage,u.shield,u.eliminated,u.sweptBy,u.basicAttacks,battle.attackInterval(u),battle.attackRange(u),battle.traits?.isGolden(u)]]);
  if(selectionKey===nextKey)return;selectionKey=nextKey;
  if(!type){panel.innerHTML='<span class="selection-kicker">FORMATION TIP</span><p>Frontline first. Rangers behind.</p><span class="tip-caption">'+(isSandbox()?'Control either team. Choose Champions to add units at any star level.':'Drag between the board and bench. Drop on a teammate to swap.')+'</span>';return;}
  const c=championStats(type,(u||record).stars,battle.catalog),location=u?.eliminated?'OUT':record?.position.bench!==undefined&&!u?'Bench':u?coordinate(u.x,u.y):'';
  if(u){c.hp=u.maxHp;c.damage=Math.round(u.attackDamage*100)/100;c.attackTicks=Number(battle.attackInterval(u).toFixed(2));c.range=battle.attackRange(u);}
  panel.innerHTML='<span class="selection-kicker">'+starLabel(u||record)+' · COST '+c.cost+' · '+c.traits.map(t=>ELEMENT_LABELS[t]||ROLES[t].name).join(' + ')+'</span><p>'+c.name+' <span class="selection-coordinate">'+location+'</span></p><span class="tip-caption">'+(c.legendary?'Legendary '+ROLES[c.combatRole].name+'. ':'')+c.description+' Attacks every '+c.attackTicks/10+'s.</span><div class="stat-row"><span>HP <strong>'+Math.ceil(u?.hp??c.hp)+'/'+c.hp+'</strong></span><span>'+(c.damageType==='true'?'TRUE DMG':'ATK')+' <strong>'+c.damage+'</strong></span><span>RANGE <strong>'+c.range+'</strong></span></div>'+(own&&trading()?'<div class="unit-actions">'+(!isSandbox()&&editable()&&own.position.bench===undefined?'<button id="bench-unit" class="secondary-button">To bench</button>':'')+'<button id="sell-unit" class="secondary-button">'+(isSandbox()?'Remove champion':'Sell · '+sellValue(own)+' gold')+'</button></div>':'');
  if(u&&own&&u.stars!==own.stars)panel.querySelector('.tip-caption').textContent+=' Next round: '+starLabel(own)+'.';
  const benchButton=$('#bench-unit');if(benchButton)benchButton.onclick=()=>perform(()=>{const slot=campaign.freeBench('azure');if(slot===undefined)throw new Error('Bench is full. Drag onto a bench champion to swap.');campaign.move(own.id,{bench:slot});say(c.name+' moved to the bench.');});
  const sellButton=$('#sell-unit');if(sellButton)sellButton.onclick=()=>sellUnit(own.id);
  if(u){const every=c.element==='air'?battle.traits?.teams[u.team].criticalEvery:0;panel.querySelector('.tip-caption').textContent+=(u.shield?' Shield: '+Math.ceil(u.shield)+'.':'')+(battle.traits?.isGolden(u)?' Golden immunity.':'')+(every?' Crit progress: '+u.basicAttacks%every+'/'+every+'.':'');}
}
function render(){
  battle=campaign.battle;
  if(isSandbox()&&battle.phase==='finished'&&campaign.phase==='combat'){
    const result=campaign.settle();
    if(result.loser){const hp=$('#'+(result.loser==='azure'?'player':'enemy')+'-hp');hp.classList.add('hp-hit');setTimeout(()=>hp.classList.remove('hp-hit'),900);}
  }
  resultReveal.sync(isSandbox()?campaign.result:null,performance.now());
  const pendingResult=resultReveal.pending(performance.now());
  const editing=editable(),p=campaign.player,enemy=campaign.opponent;
  shell.classList.toggle('placing',editing&&!!selection);
  for(const [id,el] of views)if(!battle.units.some(u=>u.id===id)){el.remove();views.delete(id);}
  for(const u of battle.units){
    const c=battle.catalog[u.type];let el=views.get(u.id);
    // Fight and Sandbox can reuse IDs for different champions.
    if(el&&el.dataset.championType!==u.type){el.remove();views.delete(u.id);el=null;}
    if(!el){el=document.createElement('div');el.dataset.unitId=u.id;el.innerHTML='<span class="trait-aura" aria-hidden="true"></span><div class="unit-portrait"><span class="portrait-art"></span><span class="unit-glyph"></span>'+roleMarker(c)+'</div><span class="unit-trait-mark" aria-hidden="true" hidden></span><span class="unit-stars"></span><div class="shield-track"><div class="shield-fill"></div></div><div class="health-track"><div class="health-fill"></div></div>';views.set(u.id,el);unitLayer.append(el);}
    el.dataset.championType=u.type;
    el.className='unit '+(c.monster?'monster-unit ':'has-art ')+u.team+' type-'+c.combatRole+' element-'+c.element+(u.hp<=0?' dead':'')+(u.eliminated?' eliminated':'')+(selection?.id===u.id?' selected':'')+(battle.traits?.burns[u.id]?' burning':'')+(u.sweptBy?' swept':'')+(u.shield>0?' shielded':'')+(battle.traits?.isGolden(u)?' golden':'');
    el.style.left=((u.sweepX??u.x)*12.5)+'%';el.style.top=(u.y*12.5)+'%';el.style.transitionDuration=(.22/playbackSpeed())+'s';
    el.querySelector('.unit-glyph').textContent=c.monster?c.glyph:c.element[0].toUpperCase()+c.cost;
    el.querySelector('.unit-stars').textContent=c.monster?'':starLabel(u);
    el.querySelector('.health-fill').style.width=(u.hp/u.maxHp*100)+'%';
    el.querySelector('.shield-fill').style.width=(u.maxShield?u.shield/u.maxShield*100:0)+'%';
  }
  const selected=battle.units.find(u=>u.id===selection?.id);
  tiles.forEach((tile,index)=>{
    const x=index%8,y=Math.floor(index/8),u=battle.at(x,y);
    tile.setAttribute('aria-label',coordinate(x,y)+', '+(y<4?'enemy':'your')+' territory'+(u?', '+u.team+' '+battle.catalog[u.type].name+', '+u.stars+' stars, '+Math.ceil(u.hp)+' health':', empty'));
    tile.title=u?battle.catalog[u.type].name+' '+starLabel(u)+' · '+Math.ceil(u.hp)+'/'+u.maxHp+' HP'+(u.shield?' · '+Math.ceil(u.shield)+' shield':''):coordinate(x,y);
    tile.classList.toggle('selected',!!u&&u.id===selection?.id);
    tile.classList.toggle('draggable',editing&&!!u&&(isSandbox()||u.team==='azure'));
    tile.classList.toggle('in-range',!!selected&&selected.hp>0&&!selected.eliminated&&!selected.sweptBy&&distance(selected,{x,y})<=battle.attackRange(selected));
  });
  const deployed=campaign.deployed().length,remaining=battle.living('azure').length;
  $('#player-hp').textContent=p.hp+' HP';$('#enemy-hp').textContent=enemy.hp+' HP';
  $('#player-count').textContent=editing?deployed+' / '+p.level+' deployed':remaining+' remaining · Level '+p.level;
  $('#enemy-count').textContent='Level '+enemy.level+' · '+battle.living('ember').length+' '+(editing?'deployed':'remaining');
  $('#squad-count').innerHTML=deployed+'<span>/'+p.level+'</span>';
  $('#phase-label').textContent=editing?'PREPARATION':campaign.phase==='finished'?'MATCH COMPLETE':campaign.phase==='result'?'ROUND COMPLETE':paused?'PAUSED':'IN COMBAT';
  $('#timer').textContent=String(Math.floor(battle.tick/600)).padStart(2,'0')+':'+String(Math.floor(battle.tick/10)%60).padStart(2,'0');
  $('#match-number').textContent=campaign.roundLabel;
  const label=pendingResult?'Round complete…':editing?(isSandbox()||p.roster.length?'Start battle':'Pass round · No units'):campaign.phase==='finished'?'New match':campaign.phase==='result'?(isSandbox()?'Edit formations':'Next round'):paused?'Resume battle':'Pause battle';
  $('#start-button').innerHTML='<span>'+label+'</span><span aria-hidden="true">'+(campaign.phase==='combat'&&!paused?'Ⅱ':'↗')+'</span>';
  $('#mobile-start').innerHTML=$('#start-button').innerHTML;
  $('#start-button').disabled=$('#mobile-start').disabled=pendingResult||(isSandbox()&&editing&&(!deployed||!campaign.deployed('ember').length));
  $('#mobile-status').textContent=(isSandbox()?'Sandbox · ':p.gold+' gold · ')+(editing?deployed+'/'+p.level+' ready':paused?'Paused':campaign.phase==='combat'?$('#timer').textContent:campaign.roundLabel);
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
  renderShop();renderBench();renderSelection();renderTraits();renderHazards();renderScouting();renderSandbox();renderSellDialog();
  $('.playback-controls').hidden=!isSandbox();
  if(isSandbox()){if(resultReveal.ready(performance.now()))showResult();else $('#result').hidden=true;}else renderLeague();
}
function scoutPlayer(id){
  if(isSandbox())return;
  cleanEffects();selection=null;traitHud.reset();campaign.scout(id);render();
  say(id==='azure'?'Your board.':'Watching '+campaign.players[id].name+'. All fights continue.');
}
function renderLeague(){
  const view=campaign.view(),p=campaign.player,phase=campaign.phase;
  if(lastViewBattle!==battle){$('#effects').replaceChildren();$('#floaters').replaceChildren();lastViewBattle=battle;}
  $('#standings-panel').hidden=false;
  const key=JSON.stringify([phase,campaign.viewId,...Object.values(campaign.players).map(p=>[p.team,p.hp,p.level,p.placement,campaign.playerStatus(p.team)])]);
  if(key!==standingsKey){standingsKey=key;
    $('#standings').innerHTML=Object.values(campaign.players).sort((a,b)=>b.hp-a.hp||(a.placement||0)-(b.placement||0)).map(p=>`<button class="standing ${p.team===campaign.viewId?'selected':''} ${p.hp<=0?'out':''}" data-player="${p.team}" aria-pressed="${p.team===campaign.viewId}" title="Scout ${p.name}"><span><strong>${p.name}${p.bot?'':' · You'}</strong><b>${p.hp} HP</b></span><small>${campaign.playerStatus(p.team)} · Lv ${p.level}${p.placement?' · #'+p.placement:''}</small></button>`).join('');
    $('#standings').querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>scoutPlayer(b.dataset.player));
  }
  const waiting=phase==='combat'&&battle.phase==='finished';
  $('#phase-label').textContent=phase==='lobby'?'EIGHT-PLAYER LOBBY':phase==='preparation'?'PREPARATION':phase==='faceoff'?'FACE-OFF':waiting?'WAITING · '+campaign.pendingFights+' FIGHTS':phase==='intermission'?'NEXT ROUND':phase==='finished'?'MATCH COMPLETE':'IN COMBAT · '+campaign.combatSpeed+'×';
  const seconds=phase==='preparation'?Math.ceil(campaign.preparationRemaining):phase==='faceoff'?Math.ceil(campaign.faceoffRemaining):phase==='intermission'?campaign.intermissionRemaining:Math.floor(campaign.combatElapsed);
  $('#timer').textContent=phase==='intermission'?seconds.toFixed(1)+'s':String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(Math.floor(seconds%60)).padStart(2,'0');
  $('#enemy-name').textContent=view.ember.name;
  $('#friendly-name').textContent=view.azure.name+(view.azure.team==='azure'?' · You':'');
  $('#player-hp').textContent=view.azure.hp+' HP';$('#enemy-hp').textContent=view.ember.hp===null?'':view.ember.hp+' HP';
  $('#player-count').textContent='Level '+view.azure.level+' · '+battle.living('azure').length+(phase==='preparation'?' deployed':' remaining');
  $('#enemy-count').textContent=phase==='preparation'||phase==='lobby'?'':view.ember.monster?'Monster encounter':'Level '+view.ember.level+' · '+battle.living('ember').length+' remaining';
  $('#territory-label').textContent=view.azure.team==='azure'?'YOUR TERRITORY':view.azure.name.toUpperCase()+' TERRITORY';
  $('#return-home').hidden=!view.watching;
  $('#view-caption').textContent=view.watching?'Watching '+view.viewed.name:p.hp<=0?'You finished #'+p.placement+' · Scout the remaining fights.':campaign.isMonsterRound?'Monster round':'Your board';
  const label=phase==='lobby'?'Start a game':phase==='finished'?'New match':phase==='preparation'?'Reveal in '+Math.ceil(campaign.preparationRemaining)+'s':phase==='faceoff'?'Fight in '+Math.ceil(campaign.faceoffRemaining)+'s':phase==='intermission'?'Next round in '+campaign.intermissionRemaining.toFixed(1)+'s':waiting?'Waiting for other fights':'Battles in progress';
  for(const selector of ['#start-button','#mobile-start']){$(selector).textContent=label;$(selector).disabled=!['lobby','finished'].includes(phase);}
  $('#mobile-status').textContent=p.gold+' gold · '+campaign.livingPlayers.length+'/8 remaining';
  $('#arena-hint').textContent=view.watching?'Scouting · Your team keeps fighting':waiting?'Waiting for every board to finish.':phase==='preparation'?'Drag to position. Enemy arrives when preparation ends.':phase==='faceoff'?'Formations locked. Combat starts in '+Math.ceil(campaign.faceoffRemaining)+'…':'Trading updates your next lineup.';
  $('#income-preview').innerHTML='<span>Next income <strong>5 base + '+Math.min(5,Math.floor(p.gold/10))+' interest</strong></span><span>'+(p.streak>=0?'Win':'Loss')+' streak <strong>'+Math.abs(p.streak)+' · +'+streakBonus(p.streak)+' gold</strong></span><small>Win +1 · Streak 2–4: +1 / 5: +2 / 6+: +3</small>';
  $('#damage-preview').textContent=campaign.isMonsterRound?'Monster win restores HP; a loss deals fixed stage damage.':'Loss: '+stageDamage(campaign.stage)+' base + 1 per enemy survivor. Draw: base damage to both.';
  $('#shop-dialog-title').textContent=phase==='preparation'?'Your shop · '+Math.ceil(campaign.preparationRemaining)+'s to prepare':'Your shop';
  $('#faceoff-countdown').hidden=phase!=='faceoff';
  $('#faceoff-countdown').textContent=phase==='faceoff'?Math.ceil(campaign.faceoffRemaining):'';
  $('#result').hidden=true;
  if(phase==='lobby'||phase==='finished'){
    const result=$('#result'),title=phase==='lobby'?'Eight companies. One winner.':campaign.players[campaign.winnerId].name+' wins.';
    const marker=phase+':'+campaign.winnerId;
    if(result.dataset.league!==marker){result.dataset.league=marker;result.className='result-overlay';result.innerHTML='<span class="eyebrow">TINY TACTICS · FIGHT</span><h2>'+title+'</h2><p>'+(phase==='lobby'?'You and seven rivals. Build your team in 30 seconds.':'Your placement: #'+p.placement+' of 8.')+'</p><button id="league-start" class="primary-button">'+(phase==='lobby'?'Start a game':'Play again')+'</button>';$('#league-start').onclick=startOrPause;}
    result.hidden=false;
  }
  if(phase==='intermission'){
    const r=campaign.results[campaign.viewId];
    $('#round-recap').hidden=false;$('#round-recap').textContent=r?(r.outcome==='win'?'Round won':r.outcome==='draw'?'Draw':'Round lost')+' · '+(r.healing?'+'+r.healing+' HP':r.damage?'−'+r.damage+' HP':'No HP lost')+' · +'+r.income.total+' gold · +'+r.xp.gained+' XP':'Next round shortly';
  }else $('#round-recap').hidden=true;
  if(seenPreparation!==campaign.preparationSerial){
    seenPreparation=campaign.preparationSerial;selection=null;traitHud.reset();
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    if(phase==='preparation'&&p.hp>0){$('#shop-dialog').showModal();say('Round '+campaign.roundLabel+' · 30 seconds to prepare.');}
  }
}
function cleanEffects(){dragging.cancel();$('#effects').replaceChildren();$('#floaters').replaceChildren();}
function startOrPause(){perform(()=>{
  if(!isSandbox()){if(campaign.phase==='lobby'){campaign.startGame();selection=null;lastTime=performance.now();say('30 seconds to prepare. Drag champions to position.');}else if(campaign.phase==='finished')restartMatch();return;}
  if(resultReveal.pending(performance.now()))return;
  dragging.cancel();
  if(editable()){campaign.start();paused=false;selection=null;lastTime=performance.now();say(campaign.lastAutoDeployed.length?'Auto-deployed '+campaign.lastAutoDeployed.length+' champion(s) from your bench. Battle underway.':campaign.deployed().length?'Battle underway.':'No champions owned. Ember claims this round.');tone(390,.12);}
  else if(campaign.phase==='result'){const retained=campaign.player.retainShop;cleanEffects();campaign.nextRound();selection=null;paused=false;$('#result').hidden=true;say(isSandbox()?'Both formations restored. Edit or start another battle.':'Round '+campaign.roundLabel+'. '+(retained?'Shop offers kept. Lock again to save them another round.':'Champions restored. Open Shop for new offers.'));}
  else if(campaign.phase==='finished')restartMatch();
  else{paused=!paused;say(paused?'Battle paused.':'Battle resumed.');}
});}
function restartMatch(){cleanEffects();traitHud.reset();campaign=fightCampaign=new League();battle=campaign.battle;selection=null;paused=false;shopKey='';$('#result').hidden=true;seenPreparation=0;standingsKey='';campaign.startGame();lastTime=performance.now();say('30 seconds to prepare your team.');}
function showResult(){
  const result=$('#result');if(!result.hidden)return;
  delete result.dataset.league;
  const r=campaign.result,won=r.outcome==='azure',draw=r.outcome==='draw';
  if(isSandbox()){
    result.className='result-overlay';result.innerHTML='<span class="eyebrow">SANDBOX · TEST '+r.round+'</span><h2>'+(draw?'Draw.':won?'Azure wins.':'Ember wins.')+'</h2><p>No player damage. Both formations are kept.</p><button id="result-next" class="primary-button">Edit formations <span>↗</span></button>';
    result.hidden=false;$('#result-next').onclick=startOrPause;say('Test complete. Edit formations or run another battle.');return;
  }
  const income=r.income.azure;
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
    if(isSandbox()&&e.type==='gold')continue;
    if(e.type==='pierce'){
      const from=battle.units.find(u=>u.id===e.throughId),to=battle.units.find(u=>u.id===e.id);
      if(from&&to){
        const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.classList.add('shot','wind-pierce');
        for(const [k,v] of Object.entries({x1:from.x*100+50,y1:from.y*100+50,x2:to.x*100+50,y2:to.y*100+50,stroke:'#d8d0ff','stroke-dasharray':'12 6'}))line.setAttribute(k,String(v));
        $('#effects').append(line);setTimeout(()=>line.remove(),360);
      }
    }
    if(['burn','meteor','heal','ejected','thunder','gold','reflection','inheritance','pierce','jump','support-shield'].includes(e.type)){
      const u=battle.units.find(v=>v.id===e.id);if(u){const n=document.createElement('span');n.className=`damage-number effect-${e.type}`;n.textContent=e.type==='gold'?'+1 GOLD':e.type==='inheritance'?'INHERITED':e.type==='jump'?'JUMP':e.type==='support-shield'?`+${Math.round(e.amount)} SHIELD`:e.execute?'EXECUTED':e.type==='ejected'?'OUT':`${e.type==='heal'?'+':'−'}${Math.round(e.amount)}`;n.style.left=`${Math.min(7,u.sweepX??u.x)*12.5+6.25}%`;n.style.top=`${u.y*12.5+3}%`;$('#floaters').append(n);setTimeout(()=>n.remove(),820);}continue;
    }
    if(e.type!=='attack')continue;
    const from=battle.units.find(u=>u.id===e.id),to=battle.units.find(u=>u.id===e.targetId);if(!from||!to)continue;
    const attackView=views.get(from.id),hitView=views.get(to.id);
    attackView?.classList.add('attacking');hitView?.classList.add('hit');
    setTimeout(()=>{attackView?.classList.remove('attacking');hitView?.classList.remove('hit');},140/playbackSpeed());
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.classList.add('shot');
    for(const [k,v] of Object.entries({x1:from.x*100+50,y1:from.y*100+50,x2:to.x*100+50,y2:to.y*100+50,stroke:from.team==='azure'?'#b8efce':'#ee9d8d'}))line.setAttribute(k,String(v));
    $('#effects').append(line);setTimeout(()=>line.remove(),360);
    const number=document.createElement('span');number.className='damage-number'+(e.dodged?' effect-dodge':e.critical?' effect-critical':'');number.textContent=e.dodged?'DODGE':`${e.critical?'CRIT ':''}−${Math.round(e.amount)}`;number.style.left=`${to.x*12.5+6.25}%`;number.style.top=`${to.y*12.5+3}%`;$('#floaters').append(number);setTimeout(()=>number.remove(),820);
    if(!played){tone(battle.catalog[from.type].combatRole==='ranger'?600:160,.035);played=true;}
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
$('#sell-zone').onclick=openSellDialog;
$('#sell-zone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSellDialog();}};
$('#close-sell').onclick=()=>$('#sell-dialog').close();
$('#game-mode').onchange=event=>switchMode(event.target.value);
for(const id of ['sandbox-team','sandbox-stars','sandbox-element','sandbox-cost'])$('#'+id).onchange=renderSandboxCatalog;
$('#close-sandbox').onclick=$('#done-sandbox').onclick=()=>$('#sandbox-dialog').close();
$('#sandbox-unit-stars').onchange=event=>perform(()=>{campaign.setStars(selection?.id,Number(event.target.value));say('Star level updated.');});
$('#sandbox-reset').onclick=resetSandbox;
$('#scout-button').onclick=$('#scout-details-button').onclick=openScout;
$('#return-home').onclick=()=>scoutPlayer('azure');
$('#close-scout').onclick=()=>$('#scout-dialog').close();
$('#scout-dialog').addEventListener('close',()=>{
  if(resumeAfterScout&&campaign.phase==='combat'&&!document.hidden){paused=false;lastTime=performance.now();render();}
  resumeAfterScout=false;
});
$('#shop-lock').onclick=()=>setShopLock(!shopLocked());
$('#close-shop').onclick=$('#done-shop').onclick=()=>$('#shop-dialog').close();
$('#shop-dialog').addEventListener('click',event=>{if(event.target===$('#shop-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
$('#new-match').onclick=()=>{if(isSandbox()&&campaign.phase==='combat'){paused=true;render();}$('#restart-dialog h2').textContent=isSandbox()?'Clear both formations?':'Start a new match?';$('#restart-dialog p').textContent=isSandbox()?'Remove all Sandbox champions. Your Fight match is kept.':'Your current match will end. All eight companies restart with 100 HP, level 3, 10 gold and three 1-cost champions.';$('#confirm-restart').textContent=isSandbox()?'Clear formations':'Start new match';$('#restart-dialog').showModal();};
$('#cancel-restart').onclick=()=>$('#restart-dialog').close();
$('#confirm-restart').onclick=()=>{$('#restart-dialog').close();perform(()=>{if(isSandbox()){campaign.clear();selection=null;cleanEffects();traitHud.reset();say('Formations cleared. Choose Champions to build both teams.');}else restartMatch();});};
document.querySelectorAll('[data-speed]').forEach(button=>button.onclick=()=>{
  if(!isSandbox())return;speed=Number(button.dataset.speed);document.querySelectorAll('[data-speed]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});render();
});
$('#help-button').onclick=()=>{if(isSandbox()&&campaign.phase==='combat'&&!paused){paused=true;say('Battle paused while you read the field guide.');render();}$('#help-dialog').showModal();};
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>$('#help-dialog').close());
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#help-dialog').open&&!$('#trait-dialog').open&&!$('#shop-dialog').open){selection=null;render();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&isSandbox()&&campaign.phase==='combat'&&!paused){paused=true;say('Battle paused while you were away.');render();}if(isSandbox())lastTime=performance.now();});
function frame(now){
  const dt=Math.max(0,(now-(lastTime||now))/1000);lastTime=now;
  fightCampaign.advance(dt);
  if(isSandbox()&&campaign.phase==='combat'&&!paused)battle.advance(Math.min(.1,dt)*speed);
  uiElapsed+=dt;
  if(uiElapsed>=.05){uiElapsed=0;render();effects(isSandbox()?battle.drainEvents():campaign.drainViewEvents());if(isSandbox())fightCampaign.drainViewEvents();}
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

