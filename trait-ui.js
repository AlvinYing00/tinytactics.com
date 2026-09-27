// Presentation only. Combat continues to use the rules in catalog/trait-effects.
export const TRAIT_DETAILS={
  fire:{name:'Fire',steps:[1,3,5,7],rows:[
    'Attacks burn for 5% max HP each second, for 3s.',
    'Burn increases to 7% max HP per second.',
    'Burn increases to 10% max HP per second.',
    '10% Burn + one Meteor per enemy. Staggered 3s falls; 25% max HP damage, up to 2 targets.'
  ],note:'Burn refreshes on hit and never stacks.'},
  water:{name:'Water',steps:[3,6,9,10],rows:[
    'Each basic attack heals the attacker for 5% max HP.',
    'Healing increases to 15% max HP per attack.',
    'Healing increases to 25% max HP per attack.',
    '25% healing + a 7s Tsunami sweeps enemies off the board. They cannot move or attack while swept; removal grants no Electric inheritance.'
  ]},
  mountain:{name:'Mountain',steps:[1,2,4,6],rows:[
    'Start combat with a shield worth 10% max HP.',
    '25% starting shield + 10% HP-damage reflection.',
    '50% starting shield + 20% HP-damage reflection.',
    '100% shield + 30% reflection. Golden Shield resists Burn, sweeps and stuns for 5s.'
  ],note:'Only basic damage that reaches HP reflects. Shield damage never reflects.'},
  electric:{name:'Electric',steps:[3,5,7],rows:[
    'On an Electric ally’s death, survivors gain 5% of its original HP and attack; heal the HP gained.',
    'Inheritance increases to 10% HP and attack.',
    '25% HP + 15% attack inheritance. Thunder once at 3s: 25% enemy max HP damage; execute targets already below 25% HP.'
  ],note:'Inherited bonuses never transfer again.'},
  air:{name:'Air',steps:[1,4,8,10],exact:true,rows:[
    '5% chance to earn 1 gold per basic attack.',
    '7.5% coin chance · 5% dodge · every 10th attack deals 2× damage.',
    '10% coin chance · 10% dodge · every 8th attack deals 2.5× damage.',
    '15% coins · 15% dodge · every 5th attack deals 3× damage. Wind Pierce: every enemy in the line behind the target takes 50% of the original hit’s damage. Reaches the board edge, including diagonals. A 5s Wind Wall blocks crossing and enemy attacks through it against Air. Air can attack through.'
  ],note:'Exact counts only. Other counts disable Air. Wind Wall does not block trait effects or grant stats.'}
};
const paths={
  fire:'<path d="M13 2c1 6-3 6-1 10 2-1 3-3 3-5 4 4 6 7 4 11-3 6-12 5-14 0-2-5 2-8 4-10-1 5 1 5 2 6 0-4 3-6 2-12Z"/>',
  water:'<path d="M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z"/><path d="M8 15c0 3 2 4 4 4"/>',
  mountain:'<path d="m2 20 7-15 4 8 3-6 6 13H2Z"/><path d="m6 12 3 2 2-2m3 2 2 1 2-1"/>',
  electric:'<path d="m14 2-9 12h6l-1 8 9-13h-6l1-7Z"/>',
  air:'<path d="M3 8h12c5 0 5-6 1-6-2 0-3 1-3 3M2 12h17c4 0 4 6 0 6-2 0-3-1-3-3M4 16h6c4 0 4 6 0 6-2 0-3-1-3-3"/>'
};
export const traitIcon=element=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[element]}</svg>`;
export function traitTier(element,count){
  const t=TRAIT_DETAILS[element];
  return t.exact?(t.steps.includes(count)?count:0):(t.steps.filter(n=>count>=n).at(-1)||0);
}
export const isMaxTrait=(element,count)=>traitTier(element,count)===TRAIT_DETAILS[element].steps.at(-1);
export const maxTraits=traits=>Object.keys(TRAIT_DETAILS).filter(e=>isMaxTrait(e,traits?.counts[e]||0));

export function createTraitHud({rail,dialog,ambience,enemyAmbience,onOpen,onClose}){
  let latest=null,selected=null,lastCounts='',previousUnits=new Map();
  const lastMax=new Map();
  const buttons=new Map();
  for(const [element,t] of Object.entries(TRAIT_DETAILS)){
    const button=document.createElement('button');button.type='button';button.className=`trait-chip element-${element}`;
    button.dataset.trait=element;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);
    button.hidden=true;
    button.innerHTML=`<span class="trait-logo">${traitIcon(element)}</span><span class="trait-count">0</span>`;
    button.onclick=()=>{selected=element;onOpen();renderDetails();dialog.showModal();};
    rail.append(button);buttons.set(element,button);
  }
  const empty=document.createElement('p');empty.className='traits-empty';empty.textContent='No active traits';rail.append(empty);
  dialog.querySelector('.close-trait').onclick=()=>dialog.close();
  dialog.addEventListener('close',onClose);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  function renderDetails(){
    if(!selected||!latest)return;
    const t=TRAIT_DETAILS[selected],count=latest.counts[selected],tier=traitTier(selected,count);
    dialog.className=`trait-dialog element-${selected}`;
    dialog.querySelector('#trait-dialog-title').innerHTML=`${traitIcon(selected)} ${t.name}`;
    dialog.querySelector('#trait-dialog-status').textContent=`${count} deployed · ${tier?`Tier ${tier}${isMaxTrait(selected,count)?' · MAX':''} active`:'Inactive'}${t.exact?' · Exact counts':''}`;
    dialog.querySelector('#trait-detail-list').innerHTML=t.steps.map((n,i)=>`<li${tier===n?' class="current" aria-current="true"':''}><span class="detail-tier">${n}${i===t.steps.length-1?'<small>MAX</small>':''}</span><p>${t.rows[i]}</p></li>`).join('');
    dialog.querySelector('#trait-dialog-note').textContent=t.note||'The highest reached tier applies to your Water champions.';
  }
  function renderAmbience(node,traits){
    if(!node)return;
    const max=maxTraits(traits),key=max.join();
    if(lastMax.get(node)===key)return;
    node.innerHTML=max.map(e=>`<div class="max-scene scene-${e}"></div>`).join('')+(max.length?`<span class="max-territory-label">${max.map(e=>traitIcon(e)+TRAIT_DETAILS[e].name.toUpperCase()).join(' + ')} · MAX</span>`:'');
    node.hidden=!max.length;lastMax.set(node,key);
  }
  function render(traits,units,views,preparation,enemyTraits){
    latest=traits;
    const counts=JSON.stringify(traits.counts);
    if(counts!==lastCounts){
      for(const [element,button] of buttons){
        const count=traits.counts[element],tier=traitTier(element,count),t=TRAIT_DETAILS[element];
        button.classList.toggle('active',!!tier);button.classList.toggle('maxed',isMaxTrait(element,count));
        button.hidden=!tier;button.title=`${t.name} ${count} · Tier ${tier}${isMaxTrait(element,count)?' MAX':''}`;
        button.querySelector('.trait-count').textContent=count;
        button.setAttribute('aria-label',`${t.name}: ${count} deployed. ${tier?`Tier ${tier} active.`:'Inactive.'} Show breakpoint details.`);
      }
      empty.hidden=[...buttons.values()].some(button=>!button.hidden);
      lastCounts=counts;if(dialog.open)renderDetails();
    }
    const nextUnits=new Map();
    for(const u of units){
      const view=views.get(u.id);if(!view||u.team!=='azure')continue;
      const element=u.type.split('-')[0],tier=u.hp>0&&!u.eliminated?traitTier(element,traits.counts[element]):0;
      const position=preparation?`${u.x},${u.y}`:'combat',prior=previousUnits.get(u.id);
      view.classList.toggle('trait-awakened',!!tier);
      const mark=view.querySelector('.unit-trait-mark');
      mark.hidden=!tier;if(tier&&!mark.firstChild)mark.innerHTML=traitIcon(element);
      if(tier&&(!prior||prior.tier!==tier||(preparation&&prior.position!==position))){
        const pulse=document.createElement('span');pulse.className='trait-burst';pulse.setAttribute('aria-hidden','true');view.append(pulse);
        setTimeout(()=>pulse.remove(),1100);
      }
      nextUnits.set(u.id,{tier,position});
    }
    previousUnits=nextUnits;
    renderAmbience(ambience,traits);renderAmbience(enemyAmbience,enemyTraits);
  }
  return {render,reset(){previousUnits.clear();lastCounts='';lastMax.clear();for(const node of [ambience,enemyAmbience])if(node){node.replaceChildren();node.hidden=true;}}};
}
