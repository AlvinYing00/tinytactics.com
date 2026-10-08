// Combat-only growth and summons. Owned formations never contain doppelgangers.
export class NatureEffects {
  constructor(traits){
    this.traits=traits;this.battle=traits.battle;this.nextGrowthTick=20;this.nextSummonTick=50;this.finished=false;
    for(const owner of this.owners()){
      owner.natureStacks=0;
      if(traits.teams[owner.team].natureDoppelgangers)this.summon(owner);
    }
  }
  owners(){return this.battle.living().filter(u=>!u.summoned&&this.battle.catalog[u.type].element==='nature');}
  has(unit,id){return this.battle.teamAugments[unit.team]?.includes(id);}
  summon(owner){
    const b=this.battle,cells=[];
    for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(!b.at(x,y)&&this.traits.canStep(owner,owner,{x,y}))cells.push({x,y});
    cells.sort((a,c)=>Number(!b.home(owner.team,a.y))-Number(!b.home(owner.team,c.y))||Math.abs(a.x-owner.x)+Math.abs(a.y-owner.y)-Math.abs(c.x-owner.x)-Math.abs(c.y-owner.y)||a.y-c.y||a.x-c.x);
    if(!cells.length)return;
    const copy=b.summon(owner,cells[0].x,cells[0].y,.25,.5);
    this.traits.baseStats.set(copy.id,{maxHp:copy.maxHp,attackDamage:copy.attackDamage});
    Object.assign(copy,{duelistStacks:0,attackSpeedBonus:0,assassinDodgeUntil:0,lightStacks:0,iceStacks:0,lightCooldownUntil:0,iceCooldownUntil:0,darkFearCount:0,darkFearReady:0});
    return copy;
  }
  update(){
    if(this.finished||this.battle.phase!=='combat')return;
    while(this.battle.tick>=this.nextGrowthTick){
      this.nextGrowthTick+=10;
      for(const unit of this.owners()){
        const rate=this.traits.teams[unit.team].natureGrowthPercent*(this.has(unit,'nature-enhancement')?2:1);if(!rate)continue;
        const hp=unit.maxHp*rate;unit.maxHp+=hp;unit.hp=Math.min(unit.maxHp,unit.hp+hp);unit.attackDamage*=1+rate;unit.natureStacks++;
        this.battle.events.push({type:'nature-growth',id:unit.id,amount:hp,rate,stacks:unit.natureStacks});
      }
    }
    if(this.battle.tick>=this.nextSummonTick){
      this.nextSummonTick+=50;
      for(const owner of this.owners())if(this.has(owner,'greener-and-greener')&&!owner.cosmicHeld&&!owner.sweptBy)this.summon(owner);
    }
  }
  finish(){this.finished=true;for(const unit of this.battle.units)delete unit.natureStacks;}
}
