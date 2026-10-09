import {TRAIT_DETAILS,traitIcon} from './trait-ui.js';
import {AUGMENTS} from './augments.js';
import {ELEMENTS,ELEMENT_LABELS} from './catalog.js';
import {augmentIcon} from './augment-ui.js';
import {augmentMatchesFilters} from './catalog-filters.js';

const summaries={
  fire:'Refreshing Burn. MAX adds Meteor Rain.',water:'Heal on attacks. MAX sweeps enemies OUT with Tsunami.',
  mountain:'Opening shields, then HP-damage reflection. MAX adds Golden Shield.',electric:'Inherit stats from fallen Electric allies. MAX adds Thunder Judgment.',
  air:'Attack gold, dodge and critical hits. MAX adds Wind Wall and Wind Pierce.',nature:'Compounding HP and Attack growth. Tier 4 summons copies.',
  light:'Stack hits to stun enemies; higher tiers resist stun and fear.',dark:'Repeated attacks cause fear. Higher tiers explode on death.',
  ice:'Chill on hit; Snowflakes trigger Freeze. MAX opens with Snowstorm.',cosmic:'Borrow a class by row. Asteroid at 2; a vortex at 3 eliminates non-Cosmic units on both teams.',
  sentinel:'Reduce champion damage. Trait damage is unaffected.',duelist:'Repeated attacks build attack speed.',ranger:'More damage from 3+ tiles away. MAX adds range.',
  support:'Heal the lowest-health allies every 5s. MAX adds shields.',assassin:'Jump toward the backline. Wind Wall blocks the opening jump.'
};
function traitReference(id){
  const t=TRAIT_DETAILS[id];
  return `<details class="guide-reference element-${id}"><summary><span class="guide-icon">${traitIcon(id)}</span><span><strong>${t.name} <small>${t.exact?'Exact ':''}${t.steps.join(' / ')}</small></strong><span>${summaries[id]}</span></span></summary><dl>${t.steps.map((n,i)=>`<dt>${n}</dt><dd>${t.rows[i]}</dd>`).join('')}</dl>${t.note?`<p>${t.note}</p>`:''}</details>`;
}
export function setupFieldGuide(){
  const $=id=>document.getElementById(id),dialog=$('help-dialog');
  $('guide-elements').innerHTML=ELEMENTS.map(traitReference).join('');
  $('guide-classes').innerHTML=Object.keys(TRAIT_DETAILS).filter(id=>TRAIT_DETAILS[id].category==='class').map(traitReference).join('');
  $('guide-augment-element').innerHTML='<option value="all">All elements</option>'+ELEMENTS.map(id=>`<option value="${id}">${ELEMENT_LABELS[id]}</option>`).join('')+'<option value="general">No element</option>';
  const tabs=[...dialog.querySelectorAll('[data-guide-tab]')];
  const select=button=>{
    for(const tab of tabs){const selected=tab===button;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$('guide-panel-'+tab.dataset.guideTab).hidden=!selected;}
  };
  for(const [i,button] of tabs.entries()){
    button.onclick=()=>select(button);
    button.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      select(tabs[index]);tabs[index].focus();
    };
  }
  function augments(){
    const matches=Object.values(AUGMENTS).filter(a=>augmentMatchesFilters(a,{type:$('guide-augment-type').value,element:$('guide-augment-element').value,query:$('guide-augment-search').value}));
    $('guide-augment-count').textContent=`${matches.length} Augments`;
    $('guide-augments').innerHTML=matches.map(a=>`<details class="guide-reference guide-augment"><summary><span class="guide-icon">${augmentIcon(a.icon)}</span><span><strong>${a.name}</strong><span>${a.type[0].toUpperCase()+a.type.slice(1)} · ${a.stages.map(stage=>`${stage}-4`).join(', ')}</span></span></summary><p>${a.description}</p>${a.requires?.element?`<p class="guide-requirement">Offered with ${ELEMENT_LABELS[a.requires.element]} ${a.requires.minimum}+ active${a.requires.element==='air'?' (Air still requires an exact breakpoint)':''}.</p>`:a.type==='combat'?'<p class="guide-requirement">Offers match your deployed team or formation.</p>':''}</details>`).join('')||'<p>No Augments match these filters.</p>';
  }
  for(const id of ['guide-augment-type','guide-augment-element'])$(id).onchange=augments;
  $('guide-augment-search').oninput=augments;augments();
}
