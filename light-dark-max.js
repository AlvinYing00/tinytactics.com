// Combat clocks are deciseconds. Opening events are local to this board fight.
export class LightDarkMaxEffects {
  constructor(controls){
    this.controls=controls;this.battle=controls.battle;
    this.judgments=[];this.nights=[];this.started=false;
  }
  heavenImmune(unit){
    // Hold On runs before controls.start(); immunity must already be installed.
    return this.controls.active()&&this.battle.tick<50&&
      this.controls.element(unit)==='light'&&this.battle.traits.teams[unit.team].heavensJudgment;
  }
  start(){
    if(this.started)return;this.started=true;
    const b=this.battle;
    for(const team of ['azure','ember']){
      const rule=b.traits.teams[team];
      if(rule.heavensJudgment){
        const tiles=[];
        for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(!b.home(team,y))tiles.push({x,y,hits:0});
        // Sweep across columns in a staggered pattern, repeated every 0.25s.
        // The last tile's twentieth hit lands exactly at five seconds.
        tiles.forEach((tile,i)=>{tile.firstTick=.5+2*i/Math.max(1,tiles.length-1);});
        this.judgments.push({team,startTick:0,endTick:50,tiles});
      }
      if(rule.eternalNight){
        this.nights.push({team,startTick:0,endTick:30});
        for(const target of b.living().filter(u=>u.team!==team))this.controls.apply(target,'fear',30);
      }
    }
  }
  damageIntents(){
    if(!this.controls.active())return [];
    const b=this.battle,hits=[];
    for(const event of this.judgments){
      if(b.tick>event.endTick)continue;
      for(const tile of event.tiles){
        while(tile.hits<20&&b.tick>=tile.firstTick+tile.hits*2.5){
          tile.hits++;
          // Resolve current occupants after movement; empty tiles still use a hit.
          const target=b.at(tile.x,tile.y);
          if(target&&target.team!==event.team&&!target.overflow)hits.push({
            source:null,sourceTeam:event.team,target,amount:target.maxHp*.01,kind:'heaven-arrow'
          });
        }
      }
    }
    return hits;
  }
  finish(){this.judgments=[];this.nights=[];}
}
