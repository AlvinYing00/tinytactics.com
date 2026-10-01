import {AUGMENTS,freeRoundRerolls} from './augments.js';
import {traitIcon} from './trait-ui.js';

const paths={
  coins:'M17 8c3 0 5 1 5 3s-2 3-5 3-5-1-5-3 2-3 5-3ZM12 11v7c0 2 2 3 5 3s5-1 5-3v-7M2 6c0-2 2-3 5-3s5 1 5 3-2 3-5 3-5-1-5-3ZM2 6v10c0 2 2 3 5 3h2M2 11c0 2 2 3 5 3h2',
  clock:'M12 7v5l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  level:'M5 20V14h4v6M10 20V10h4v10M15 20V6h4v14M4 8l8-6 8 2M16 1l4 3-3 4',
  heart:'M12 21 3 12C-3 5 6-2 12 5c6-7 15 0 9 7L12 21ZM6 11h4l2-3 2 6 2-3h3',
  gift:'M3 8h18v5H3V8ZM5 13v8h14v-8M12 8v13M12 8C3 9 4 0 9 3l3 5ZM12 8c9 1 8-8 3-5l-3 5Z',
  stars:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',
  refresh:'M21 10a9 9 0 0 0-15-5L3 8M3 2v6h6M3 14a9 9 0 0 0 15 5l3-3M15 16h6v6'
};
export function augmentIcon(icon){
  return paths[icon]?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[icon]}"/></svg>`:traitIcon(icon);
}
export const pendingAugment=game=>game.mode!=='sandbox'&&game.phase==='preparation'&&game.player.hp>0&&game.player.augmentChoice?.round===game.round&&!game.player.augmentChoice.selected;
export function selectedAugmentCards(player,statusFor=()=> ''){
  return (player.augments||[]).map(id=>{
    const a=AUGMENTS[id];if(!a)return '';
    const status=statusFor(a);
    return `<article class="owned-augment"><span class="augment-logo">${augmentIcon(a.icon)}</span><div><h3>${a.name}</h3><p>${a.description}</p>${status?`<small>${status}</small>`:''}</div></article>`;
  }).join('')||'<p class="augment-empty">No Augments selected yet.</p>';
}

// Modal state is local: inspecting the board never consumes or resets a choice.
export function createAugmentUI({getGame,onChanged,onError,openShop,beforeOpen}){
  const $=id=>document.getElementById(id),dialog=$('augment-dialog'),ownedDialog=$('owned-augments-dialog');
  let lastGame=null,promptedRound=null,cardKey='',ownedKey='';
  const open=()=>{if(!pendingAugment(getGame()))return;beforeOpen();render();if(!dialog.open)dialog.showModal();};
  $('choose-augment').onclick=open;
  $('augment-view-board').onclick=()=>dialog.close();
  $('augment-open-shop').onclick=()=>{dialog.close();openShop();};
  $('owned-augments-button').onclick=()=>{beforeOpen();render();ownedDialog.showModal();};
  $('close-owned-augments').onclick=()=>ownedDialog.close();
  function render(){
    const game=getGame(),p=game.player,active=game.mode!=='sandbox',pending=pendingAugment(game);
    const subject=game.players[game.viewId]||p,watching=subject!==p;
    if(lastGame!==game){lastGame=game;promptedRound=null;cardKey='';ownedKey='';}
    $('augment-controls').hidden=!active||(!pending&&!watching&&!(p.augments||[]).length);
    $('choose-augment').hidden=!pending;
    $('owned-augments-button').hidden=!watching&&!(p.augments||[]).length;
    $('owned-augments-button').textContent=`${watching?subject.name+'’s ':''}Augments · ${(subject.augments||[]).length}`;
    $('owned-augments-title').textContent=watching?subject.name+'’s Augments':'Your Augments';
    if(!active){if(dialog.open)dialog.close();if(ownedDialog.open)ownedDialog.close();return;}
    const owned=[subject.team,subject.augments,watching?null:[p.investment,p.freeRerolls,p.freeRerollRound,p.purchaseBoosts,p.eliteJourney],game.phase,game.round];
    if(JSON.stringify(owned)!==ownedKey){
      ownedKey=JSON.stringify(owned);
      $('owned-augments-list').innerHTML=selectedAugmentCards(subject,a=>{
        if(watching)return '';
        let status='';
        if(a.effect.investment)status=p.investment?`${p.investment.rounds} rounds left · ${p.investment.gold+50} gold payout`:'Investment paid out';
        if(a.effect.rerolls)status=`${p.freeRerolls||0} free rerolls remaining in total`;
        if(a.effect.purchase)status=p.purchaseBoosts?.[a.effect.purchase.cost]?'Ready for your next matching purchase':'Purchase bonus used';
        if(a.effect.freeRound)status=freeRoundRerolls(game,p)?'Free rerolls active now':game.round<33?'Activates during 5-5 preparation':'Free reroll round ended';
        if(a.effect.elite)status=p.eliteJourney?.pending?.length?`${p.eliteJourney.pending.length} copies still to arrive`:'All copies received';
        return status;
      });
    }
    if(!pending){if(dialog.open)dialog.close();return;}
    const seconds=Math.max(0,Math.ceil(game.preparationRemaining));
    $('choose-augment').textContent=`Choose Augment · ${seconds}s`;
    $('augment-countdown').textContent=`${seconds}s`;
    $('augment-countdown').classList.toggle('urgent',seconds<=5);
    $('augment-round').textContent=`ROUND ${game.roundLabel} · ECONOMY`;
    const choice=p.augmentChoice,key=JSON.stringify([choice.round,choice.offers,choice.rerolled]);
    if(key!==cardKey){
      cardKey=key;
      $('augment-options').innerHTML=choice.offers.map((id,slot)=>{const a=AUGMENTS[id];return `<article class="augment-card"><span class="augment-logo">${augmentIcon(a.icon)}</span><h3>${a.name}</h3><p>${a.description}</p><div class="augment-card-actions"><button class="augment-select" data-augment="${id}" aria-label="Choose ${a.name}">Choose</button><button class="augment-reroll" data-augment-slot="${slot}" aria-label="Reroll ${a.name}" ${choice.rerolled[slot]?'disabled':''}>${choice.rerolled[slot]?'Rerolled':'Reroll ↻'}</button></div></article>`;}).join('');
      $('augment-options').querySelectorAll('[data-augment]').forEach(button=>button.onclick=()=>{
        try{const a=game.chooseAugment(button.dataset.augment);dialog.close();onChanged(`${a.name} selected.`);openShop();}catch(error){onError(error.message);}
      });
      $('augment-options').querySelectorAll('[data-augment-slot]').forEach(button=>button.onclick=()=>{
        try{game.rerollAugment(Number(button.dataset.augmentSlot));render();}catch(error){onError(error.message);}
      });
    }
    if(promptedRound!==game.round){promptedRound=game.round;beforeOpen();if(!dialog.open)dialog.showModal();}
  }
  return {render,open};
}
