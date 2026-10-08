import {SANDBOX_AUGMENTS,SANDBOX_AUGMENT_LIMIT} from './sandbox.js';
import {augmentIcon} from './augment-ui.js';
import {CHAMPIONS} from './catalog.js';

const labels={combat:'Combat',trait:'Trait',class:'Class'};
export function createSandboxAugmentUI({getGame,onChanged,beforeOpen}){
  const $=id=>document.getElementById(id),dialog=$('sandbox-augments-dialog');
  let key='',lastGame=null;
  const feedback=(message,error=false)=>{
    $('sandbox-augments-feedback').textContent=message;
    $('sandbox-augments-feedback').classList.toggle('error',error);
  };
  function change(action){
    try{const message=action();feedback(message);onChanged(message);render();}
    catch(error){feedback(error.message,true);}
  }
  function remove(id){change(()=>{getGame().removeAugment(id,$('sandbox-augment-team').value);return 'Augment removed. Gifted champions stay on the board.';});}
  $('sandbox-augments-button').onclick=()=>{
    if(getGame().mode!=='sandbox')return;
    beforeOpen();key='';feedback('Choose Augments for either team. Reset battle to edit after fighting.');render();$('sandbox-augment-catalog').scrollTop=0;dialog.showModal();
  };
  $('close-sandbox-augments').onclick=$('done-sandbox-augments').onclick=()=>dialog.close();
  for(const id of ['sandbox-augment-team','sandbox-augment-type'])$(id).onchange=()=>{key='';feedback('Selections are saved separately for each team.');render();$('sandbox-augment-catalog').scrollTop=0;};
  $('sandbox-augment-search').oninput=()=>{render();$('sandbox-augment-catalog').scrollTop=0;};
  $('sandbox-augments-clear').onclick=()=>change(()=>{getGame().clearAugments($('sandbox-augment-team').value);return 'Team Augments cleared. Champions stay on the board.';});
  $('sandbox-augment-selected').onclick=event=>{const button=event.target.closest('[data-remove-augment]');if(button)remove(button.dataset.removeAugment);};
  $('sandbox-augment-catalog').onclick=event=>{
    const button=event.target.closest('[data-sandbox-augment]');if(!button||button.disabled)return;
    const id=button.dataset.sandboxAugment,team=$('sandbox-augment-team').value;
    if(getGame().players[team].augments.includes(id)){remove(id);return;}
    change(()=>{
      const {augment,gift,giftSkipped}=getGame().addAugment(id,team);
      return `${augment.name} added to ${team==='azure'?'Azure':'Ember'}.`+(gift?` ${CHAMPIONS[gift.type].name} placed at 1★.`:giftSkipped?' Gift skipped: the board is full or all matching champions are already placed.':'');
    });
  };
  function render(){
    const game=getGame(),active=game.mode==='sandbox';
    $('sandbox-augment-controls').hidden=!active;
    if(!active){if(dialog.open)dialog.close();return;}
    if(lastGame!==game){lastGame=game;key='';}
    $('sandbox-augments-button').textContent=`Augments · Azure ${game.player.augments.length} · Ember ${game.opponent.augments.length}`;
    const team=$('sandbox-augment-team').value,selected=game.players[team].augments;
    const type=$('sandbox-augment-type').value,query=$('sandbox-augment-search').value.trim().toLowerCase(),editable=game.phase==='preparation';
    const next=JSON.stringify([team,selected,type,query,editable]);if(next===key)return;key=next;
    $('sandbox-augment-count').textContent=`${team==='azure'?'Azure':'Ember'} · ${selected.length}/${SANDBOX_AUGMENT_LIMIT} selected`;
    $('sandbox-augment-hint').textContent=editable?'Choose up to 5 per team, from any stage. Effects still need matching champions or breakpoints.':'Viewing this battle’s Augments. Reset the battle to change selections.';
    $('sandbox-augments-clear').disabled=!editable||!selected.length;
    $('sandbox-augment-selected').innerHTML=selected.map(id=>{
      const a=SANDBOX_AUGMENTS.find(a=>a.id===id);
      return `<button type="button" data-remove-augment="${id}" aria-label="Remove ${a.name}" ${editable?'':'disabled'}>${a.name}<span aria-hidden="true"> ×</span></button>`;
    }).join('')||'<span class="sandbox-augment-empty">No Augments selected.</span>';
    const matches=SANDBOX_AUGMENTS.filter(a=>(type==='all'||a.type===type)&&(!query||`${a.name} ${a.description}`.toLowerCase().includes(query)));
    $('sandbox-augment-results').textContent=`${matches.length} Augments`;
    $('sandbox-augment-catalog').innerHTML=matches.map(a=>{
      const chosen=selected.includes(a.id),disabled=!editable||(!chosen&&selected.length>=SANDBOX_AUGMENT_LIMIT);
      return `<article class="sandbox-augment-card ${chosen?'is-selected':''}" data-augment-type="${a.type}"><div class="sandbox-augment-card-head"><span class="augment-logo">${augmentIcon(a.icon)}</span><div><span class="augment-kind">${labels[a.type]}</span><h3>${a.name}</h3></div></div><p>${a.description}</p><button type="button" data-sandbox-augment="${a.id}" aria-pressed="${chosen}" aria-label="${chosen?'Remove':'Add'} ${a.name}" ${disabled?'disabled':''}>${chosen?'Selected · Remove':editable&&selected.length>=SANDBOX_AUGMENT_LIMIT?'Team full':'Add Augment'}</button></article>`;
    }).join('')||'<p class="sandbox-empty">No matching Augments. Try another search or type.</p>';
  }
  return {render};
}
