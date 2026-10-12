// Virtual rows are drawn one tile beyond the normal board, with a one-tile gap.
import {crystalDisplayY} from './combat-coordinates.js';
export {crystalDisplayY} from './combat-coordinates.js';
export function renderCrystalUI(battle,tiles,domain,top,bottom){
  const combat=battle.phase==='combat';
  const tierMax=Object.values(battle.traits?.teams||{}).some(t=>t.crystalTier===6);
  const animated=combat&&tierMax&&battle.tick<600&&battle.units.some(u=>u.crystalMirror&&u.hp>0&&!u.eliminated&&battle.traits.teams[u.team].crystalTier===6);
  // The temporary Crystal animation covers even Cosmic terrain. Cosmic returns
  // when the animation expires or the last MAX mirror is removed.
  const max=animated;
  domain.hidden=!max;domain.parentElement.classList.toggle('crystal-max',max);
  if(max&&!domain.childElementCount){
    domain.innerHTML='<div class="crystal-aurora"></div><div class="crystal-emblem">◇</div>'+Array.from({length:1024},(_,i)=>`<i class="crystal-star" style="left:${(i*31.713)%100}%;top:${(i*17.373)%100}%;--twinkle:${2+i%9*.47}s;--delay:-${i*.113}s"></i>`).join('');
  }
  let arena=domain.querySelector('.crystal-arena-animation');
  if(animated&&!arena){
    arena=document.createElement('img');arena.className='crystal-arena-animation';arena.alt='';arena.draggable=false;
    domain.prepend(arena);
  }
  if(arena){
    arena.hidden=!animated;
    if(animated&&!arena.hasAttribute('src'))arena.src='assets/terrain/crystal-arena.gif';
    else if(!animated)arena.removeAttribute('src');
  }
  domain.classList.toggle('crystal-arena-playing',animated);
  const cells=['azure','ember'].flatMap(team=>{
    // MAX activates every cell mechanically, without painting all 64 tiles.
    const count=battle.traits?.teams[team].crystalTier??0;
    const cells=battle.prismaticTiles(team);return count===6||cells.length>2?[]:cells.map(p=>({...p,team}));
  });
  tiles.forEach((tile,i)=>{
    const prism=cells.find(p=>p.x===i%8&&p.y===Math.floor(i/8));tile.classList.toggle('prismatic-tile',!!prism);
    if(prism)tile.title+=' · Prismatic Tile: place a Crystal champion here to activate its mirror';
  });
  for(const [platform,y] of [[top,-1],[bottom,battle.height]]){
    const active=combat&&battle.units.some(u=>u.y===y&&u.hp>0&&!u.eliminated);
    platform.hidden=!active;(y===-1?platform.nextElementSibling:platform.previousElementSibling)?.classList.toggle('crystal-gap-active',active);
  }
}
export function renderCrystalEvent(event,svg,speed=1){
  if(!['crystal-exchange','crystal-mirror','crystal-return'].includes(event.type))return false;
  if(!svg.querySelector('#crystal-beam-gradient')){
    const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
    defs.innerHTML='<linearGradient id="crystal-beam-gradient"><stop offset="0" stop-color="#85ffe4"/><stop offset=".3" stop-color="#97d6ff"/><stop offset=".65" stop-color="#e4a5ff"/><stop offset="1" stop-color="#fff2b6"/></linearGradient><linearGradient id="crystal-trail-gradient"><stop offset="0" stop-color="#ae8cff" stop-opacity="0"/><stop offset=".65" stop-color="#adccff" stop-opacity=".7"/><stop offset="1" stop-color="#ffffff"/></linearGradient>';svg.append(defs);
  }
  const projectiles=event.type==='crystal-exchange'&&event.projectiles===2;
  const segments=projectiles?[{from:event.from,to:event.to,source:'owner'},{from:event.to,to:event.from,source:'mirror'}]:[{from:event.from,to:event.to}];
  const duration=(event.durationTicks??7)*100/Math.max(speed,1);
  for(const [index,segment] of segments.entries()){
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.style.stroke='url(#crystal-beam-gradient)';line.style.animationDuration=`${duration}ms`;
    line.classList.add('crystal-beam',projectiles?'crystal-exchange-beam':'crystal-teleport');
    const start=segment.from,end=segment.to;
    const x1=start.x*100+50,y1=crystalDisplayY(start.y)*100+50,x2=end.x*100+50,y2=crystalDisplayY(end.y)*100+50;
    for(const [key,value] of Object.entries({x1,y1,x2,y2}))line.setAttribute(key,value);
    svg.append(line);setTimeout(()=>line.remove(),duration);
    if(projectiles){
      const shard=document.createElementNS('http://www.w3.org/2000/svg','g');
      shard.classList.add('crystal-projectile');shard.dataset.crystalSource=segment.source;
      const angle=Math.atan2(y2-y1,x2-x1)*180/Math.PI;
      shard.innerHTML=`<g transform="rotate(${angle})"><path class="crystal-projectile-trail" d="M-100,-2 L-9,-10 L4,0 L-9,10 L-100,2 Z"/><path class="crystal-projectile-shell" d="M27,0 L-7,-17 L-23,0 L-7,17 Z"/><path class="crystal-projectile-core" d="M22,0 L-7,-9 L-16,0 L-7,9 Z"/><path class="crystal-projectile-facet" d="M-7,-17 L-2,0 L-7,17 M-23,0 L27,0"/></g>`;
      shard.style.setProperty('--crystal-glow',index?'#e49aff':'#69f7ff');
      svg.append(shard);
      const motion=shard.animate([{transform:`translate(${x1}px,${y1}px)`},{transform:`translate(${x2}px,${y2}px)`}],{duration,easing:'linear',fill:'forwards'});
      motion.id=`crystal-projectile-${segment.source}`;
      motion.onfinish=motion.oncancel=()=>shard.remove();
    }
  }
  return true;
}
