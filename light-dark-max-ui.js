// Render from the simulation clock so pause, speed and scouting stay in sync.
export function renderLightDarkMax(battle,tick=battle.tick){
  if(battle.phase!=='combat'||!battle.controls?.active())return '';
  let html='';
  for(const event of battle.controls.max?.nights||[]){
    if(tick<event.startTick||tick>=event.endTick)continue;
    const p=(tick-event.startTick)/(event.endTick-event.startTick);
    html+=`<div class="max-opening eternal-night" data-source-team="${event.team}" style="top:${event.team==='azure'?0:50}%;--night-turn:${p*28}deg" aria-hidden="true"><div class="night-veil"></div><div class="night-rift"></div><span class="max-opening-label">ETERNAL NIGHT <b>${((event.endTick-tick)/10).toFixed(1)}s</b></span></div>`;
  }
  for(const event of battle.controls.max?.judgments||[]){
    if(tick<event.startTick||tick>=event.endTick)continue;
    const h=battle.height/2,top=event.team==='azure'?0:50,localY=event.team==='azure'?0:h;
    const arrows=event.tiles.map((tile,i)=>{
      const x=(tile.x+.5)/battle.width*800,y=(tile.y-localY+.5)/h*400;
      // Three decorative shafts accompany each actual tile hit (1,920 shafts).
      // Their travel and impact glints have no combat/on-hit side effects.
      return [0,1,2].map(j=>{
        const cycle=(tick-tile.firstTick-j*.35)/2.5,shot=Math.ceil(cycle),p=1-(shot-cycle);
        if(shot<0||shot>=20)return '';
        const px=x+(j-1)*18+(1-p)*14,py=y-(1-p)*105;
        return `<g class="judgment-arrow" opacity="${(.25+.7*p).toFixed(2)}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><path class="arrow-trail" d="M9 -75 0 0"/><path class="arrow-shaft" d="M7 -56 0 0 m-5 -12 5 12 8 -10 M5 -42 0 -49 m6 0 5 -5"/></g>${p>.7?`<ellipse class="judgment-impact" cx="${x+(j-1)*18}" cy="${y}" rx="${3+(p-.7)*22}" ry="${2+(p-.7)*10}" opacity="${(1-p)*1.8}"/>`:''}`;
      }).join('');
    }).join('');
    html+=`<div class="max-opening heavens-judgment" data-source-team="${event.team}" style="top:${top}%" aria-hidden="true"><div class="heaven-aperture"></div><svg class="judgment-rain" viewBox="0 0 800 400" preserveAspectRatio="none">${arrows}</svg><span class="max-opening-label">HEAVEN’S JUDGMENT <b>${((event.endTick-tick)/10).toFixed(1)}s</b></span></div>`;
  }
  return html;
}
