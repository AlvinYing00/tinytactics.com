// Presentation only: all positions and motion follow the existing combat clock.
// No animation timer or random roll can change damage, movement, or duration.
const clamp=value=>Math.max(0,Math.min(1,value));
const image=(name,classes)=>`<img class="${classes}" src="assets/effects/${name}.png" alt="" draggable="false">`;

export function renderWaterAirHazards(battle,tick){
  if(battle.phase!=='combat'||!battle.traits)return '';
  let html='';
  for(const wave of battle.traits.waves){
    if(wave.completed||tick<wave.startTick||tick>=wave.endTick)continue;
    const progress=clamp((tick-wave.startTick)/(wave.endTick-wave.startTick)),seconds=(tick-wave.startTick)/10;
    const droplets=Array.from({length:28},(_,i)=>{
      const phase=(seconds*.52+i*.618)%1,x=57+Math.sin(i*5.7+phase*3)*32+phase*18,y=(i*37.7-phase*19+100)%100;
      return `<i class="wave-droplet" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--drop:${2+i%4}px;opacity:${(.12+Math.sin(phase*Math.PI)*.65).toFixed(3)}"></i>`;
    }).join('');
    html+=`<div class="tsunami-wave" data-team="${wave.team}" style="left:${(progress*100).toFixed(3)}%;--surge:${(Math.sin(seconds*3.2)*1.2).toFixed(3)}%;--shimmer:${(.88+Math.sin(seconds*4.1)*.06).toFixed(3)}">${image('tsunami-crest','tsunami-art')}${image('tsunami-crest','tsunami-mist')}${droplets}<span>TSUNAMI</span></div>`;
  }
  for(const wall of battle.traits.walls){
    if(!battle.traits.wallActive(wall)||tick>=wall.endTick)continue;
    const seconds=tick/10;
    const motes=Array.from({length:20},(_,i)=>{
      const x=(i*17.3+seconds*12)%100,y=30+Math.sin(i*3.1+seconds*2)*19;
      return `<i class="wind-mote" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;opacity:${(.3+Math.sin(i+seconds)**2*.6).toFixed(3)}"></i>`;
    }).join('');
    html+=`<div class="wind-wall ${wall.team}" style="top:${(wall.y+.5)/battle.height*100}%;--gust-shift:${(Math.sin(seconds*2.1)*1.1).toFixed(3)}%;--gust-scale:${(1+Math.sin(seconds*2.6)*.018).toFixed(4)}">${image('wind-wall-gust','wind-art')}${image('wind-wall-gust','wind-echo')}${motes}<span>${wall.team==='azure'?'AZURE':'EMBER'} WIND WALL · ${Math.max(0,(wall.endTick-tick)/10).toFixed(1)}s</span></div>`;
  }
  return html;
}
