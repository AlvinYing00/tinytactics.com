import {crystalDisplayY} from './combat-coordinates.js';

// Presentation only. Combat owns launch, impact, target positions and damage.
// Every moving detail uses the simulation clock, including at pause/fast-forward.
const clamp=value=>Math.max(0,Math.min(1,value));
const number=value=>Number(value.toFixed(3));
const position=(x,y)=>`left:${number(x)}%;top:${number(y)}%;`;

function flight(kind,team,x,y,progress,elapsed){
  const cosmic=kind==='cosmic',p=clamp(progress),travel=p**1.16;
  const fromX=x-(cosmic?30:17),fromY=Math.min(-17,y-(cosmic?70:48));
  const px=fromX+(x-fromX)*travel,py=fromY+(y-fromY)*travel;
  const angle=-Math.atan2(x-fromX,y-fromY)*180/Math.PI;
  const scale=(cosmic?.57:.7)+(cosmic?.49:.32)*p;
  const fragments=Array.from({length:cosmic?10:6},(_,i)=>{
    const age=(elapsed*.64+i*.163)%1;
    const spread=Math.sin(i*9.13)*(.25+age*.7),distance=2+age*8;
    return `<i class="meteor-flight-fragment" style="--fragment-x:${number(spread)}cqw;--fragment-y:${number(-distance)}cqw;--fragment-turn:${number(i*57+age*130)}deg;--fragment-size:${number(.14+(i%3)*.055)}cqw;opacity:${number(Math.sin(age*Math.PI)*.75)}"></i>`;
  }).join('');
  return `<div class="meteor-contact ${kind}" data-team="${team}" style="${position(x,y)}--contact-scale:${number(.55+p*.45)};--contact-opacity:${number(.12+p*.35)}"><i></i></div>`+
    `<div class="meteor-flight ${kind}" data-team="${team}" style="${position(px,py)}--flight-angle:${number(angle)}deg;--flight-scale:${number(scale)};--plasma-pulse:${number(.94+Math.sin(elapsed*7.3)*.06)}"><img class="meteor-rock-art" src="assets/effects/${cosmic?'cosmic-asteroid':'fire-meteor'}.png" alt="" draggable="false"><i class="meteor-head-light"></i>${fragments}</div>`;
}

function impact(kind,team,x,y,age){
  const cosmic=kind==='cosmic',duration=cosmic?10:7,p=clamp(age/duration);
  if(age<0||age>=duration)return '';
  const expansion=1-(1-p)**2,fade=1-p;
  const fragments=Array.from({length:cosmic?18:11},(_,i)=>{
    const angle=i*2.39996323,distance=(cosmic?15:8)*expansion*(.55+(i%5)*.1);
    const dx=Math.cos(angle)*distance,dy=Math.sin(angle)*distance*.65-Math.sin(p*Math.PI)*(1+i%3);
    return `<i class="meteor-impact-fragment" style="--fragment-x:${number(dx)}cqw;--fragment-y:${number(dy)}cqw;--fragment-turn:${number(i*49+p*240)}deg;--fragment-size:${number(.22+i%3*.12)}cqw;opacity:${number(fade**1.3)}"></i>`;
  }).join('');
  return `<div class="meteor-impact ${kind}" data-team="${team}" style="${position(x,y)}--blast-scale:${number(.12+expansion*.88)};--blast-opacity:${number(fade*.75)};--flash-scale:${number(.4+expansion*1.2)};--flash-opacity:${number(Math.max(0,1-p*3))};--dust-scale:${number(.3+expansion*.9)};--dust-opacity:${number(Math.sin(p*Math.PI)*.42)}"><i class="meteor-impact-flash"></i><i class="meteor-shockwave"></i><i class="meteor-shockwave-inner"></i><i class="meteor-impact-dust"></i>${fragments}</div>`;
}

export function renderMeteorHazards(battle,tick){
  if(battle.phase!=='combat'||!battle.traits||!Number.isFinite(tick))return '';
  const width=battle.width||8,height=battle.height||8;
  let html='';
  for(const rock of battle.traits.cosmic?.asteroids||[]){
    if(tick<rock.startTick)continue;
    const x=50,y=rock.team==='azure'?25:75;
    if(rock.impacted)html+=impact('cosmic',rock.team,x,y,tick-rock.impactTick);
    else if(tick<rock.impactTick)html+=flight('cosmic',rock.team,x,y,(tick-rock.startTick)/(rock.impactTick-rock.startTick),(tick-rock.startTick)/10);
  }
  for(const meteor of battle.traits.meteors||[]){
    if(tick<meteor.launchTick)continue;
    const x=(meteor.x+.5)/width*100,y=(crystalDisplayY(meteor.y,height)+.5)/height*100;
    if(meteor.impacted)html+=impact('fire',meteor.team,x,y,tick-meteor.impactTick);
    else if(tick<meteor.impactTick)html+=flight('fire',meteor.team,x,y,(tick-meteor.launchTick)/(meteor.impactTick-meteor.launchTick),(tick-meteor.launchTick)/10);
  }
  return html;
}
