// Combat-only growth and summons. Owned formations never contain doppelgangers.
export class NatureEffects {
  constructor(traits){
    this.traits=traits;this.battle=traits.battle;this.nextGrowthTick=20;this.finished=false;
    const owners=this.battle.living().filter(u=>!u.summoned&&this.battle.catalog[u.type].element==='nature');
    for(const owner of owners){
      owner.natureStacks=0;
      if(!traits.teams[owner.team].natureDoppelgangers)continue;
      const cells=[];
      for(let y=0;y<this.battle.height;y++)for(let x=0;x<this.battle.width;x++)if(this.battle.home(owner.team,y)&&!this.battle.at(x,y)&&traits.canStep(owner,owner,{x,y}))cells.push({x,y});
      cells.sort((a,b)=>Math.abs(a.x-owner.x)+Math.abs(a.y-owner.y)-Math.abs(b.x-owner.x)-Math.abs(b.y-owner.y)||a.y-b.y||a.x-b.x);
      if(!cells.length)continue;
      const copy=this.battle.summon(owner,cells[0].x,cells[0].y);
      traits.baseStats.set(copy.id,{maxHp:copy.maxHp,attackDamage:copy.attackDamage});
    }
  }
  update(){
    if(this.finished||this.battle.phase!=='combat')return;
    while(this.battle.tick>=this.nextGrowthTick){
      this.nextGrowthTick+=10;
      for(const unit of this.battle.living().filter(u=>!u.summoned&&this.battle.catalog[u.type].element==='nature')){
        const rate=this.traits.teams[unit.team].natureGrowthPercent;if(!rate)continue;
        const hp=unit.maxHp*rate;unit.maxHp+=hp;unit.hp=Math.min(unit.maxHp,unit.hp+hp);unit.attackDamage*=1+rate;unit.natureStacks++;
        this.battle.events.push({type:'nature-growth',id:unit.id,amount:hp,rate,stacks:unit.natureStacks});
      }
    }
  }
  finish(){this.finished=true;for(const unit of this.battle.units)delete unit.natureStacks;}
}
