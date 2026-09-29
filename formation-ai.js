import {CHAMPIONS,championStats,teamTraits} from './catalog.js';
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const key=p=>`${p.x},${p.y}`;
const isCarry=u=>['ranger','support'].includes(CHAMPIONS[u.type].combatRole);
const isTank=u=>CHAMPIONS[u.type].combatRole==='sentinel';
const mean=units=>units.length?units.reduce((sum,u)=>sum+u.position.x,0)/units.length:3.5;

// Only deployed identities, stars and positions enter this evaluator.
// Enemy shops, gold, benches and future random rolls are never consulted.
export function chooseFormation(roster,scouted=[]){
  const enemies=scouted.filter(u=>u.position.bench===undefined).map(u=>({...u,position:{x:u.position.x,y:7-u.position.y}}));
  const ownTraits=teamTraits(roster.map(u=>({...u,position:{x:0,y:4}}))),enemyTraits=teamTraits(enemies),enemyFront=enemies.filter(u=>CHAMPIONS[u.type].range===1),enemyCarries=enemies.filter(isCarry);
  const wall=ownTraits.windWall||enemyTraits.windWall,enemyAssassins=enemies.filter(u=>CHAMPIONS[u.type].combatRole==='assassin');
  const formations=[];
  for(const name of ['Balanced','Spread','Left flank','Right flank','Rear guard','Forward range']){
    const positions=new Map(),occupied=new Set();
    const order=roster.slice().sort((a,b)=>Number(!isTank(a))-Number(!isTank(b))||Number(isCarry(a))-Number(isCarry(b))||championStats(b.type,b.stars).hp-championStats(a.type,a.stars).hp);
    let guardPlaced=false,frontCount=0,backCount=0;
    for(const u of order){
      const c=CHAMPIONS[u.type],back=c.range>1,guard=name==='Rear guard'&&isTank(u)&&frontCount>0&&!guardPlaced;
      if(guard)guardPlaced=true;
      const rows=guard?[6,7,5,4]:back?(name==='Forward range'?[6,7,5,4]:[7,6,5,4]):c.combatRole==='assassin'?[5,4,6,7]:[4,5,6,7];
      let center=name==='Left flank'?1:name==='Right flank'?6:c.combatRole==='assassin'?mean(enemyCarries):back?7-mean(enemyCarries):mean(enemyFront);
      const columns=name==='Spread'?[0,7,2,5,1,6,3,4].slice():Array.from({length:8},(_,i)=>i).sort((a,b)=>Math.abs(a-center)-Math.abs(b-center)||a-b);
      if(name==='Spread'){const shift=(back?backCount:frontCount)%4;columns.push(...columns.splice(0,shift));}
      const pos=rows.flatMap(y=>columns.map(x=>({x,y}))).find(p=>!occupied.has(key(p)));
      positions.set(u.id,pos);occupied.add(key(pos));if(back)backCount++;else frontCount++;
    }
    const units=roster.map(u=>({...u,position:positions.get(u.id)})),tanks=units.filter(isTank),reasons={protection:0,range:0,spacing:0,assassins:0,matchup:0};
    for(const u of units){
      const c=CHAMPIONS[u.type],pos=u.position;
      if(isCarry(u)){
        const covered=tanks.some(t=>t.position.y<pos.y&&Math.abs(t.position.x-pos.x)<=2);
        reasons.protection+=covered?12:-8;
        const nearest=enemies.slice().sort((a,b)=>distance(pos,a.position)-distance(pos,b.position))[0];
        if(nearest){
          const d=distance(pos,nearest.position),range=c.range+(c.combatRole==='ranger'?ownTraits.classes.ranger.rangeBonus:0);
          if(c.combatRole==='ranger')reasons.range+=(d>=3?6:-6)+(d<=range?5:-Math.max(0,d-range));
          if(c.combatRole==='support'&&!covered&&d<=CHAMPIONS[nearest.type].range)reasons.protection-=10;
          if(CHAMPIONS[nearest.type].element==='mountain'&&isTank(nearest))reasons.matchup+=c.element==='fire'?4:-2;
        }
        if(enemyAssassins.length&&!wall){
          const adjacent=[[0,-1],[1,0],[0,1],[-1,0]].map(([x,y])=>({x:pos.x+x,y:pos.y+y})).filter(p=>p.x>=0&&p.x<8&&p.y>=0&&p.y<8&&!occupied.has(key(p)));
          const guarded=adjacent.filter(p=>tanks.some(t=>distance(t.position,p)<=1)).length;
          reasons.assassins+=guarded*4-(adjacent.length-guarded)*3;
        }
      }
      if(c.combatRole==='assassin'){
        const targets=enemies.filter(isCarry),enemyOccupied=new Set(enemies.map(e=>key(e.position)));
        const access=targets.some(t=>[[0,-1],[1,0],[0,1],[-1,0]].some(([x,y])=>{const p={x:t.position.x+x,y:t.position.y+y};return p.x>=0&&p.x<8&&p.y>=0&&p.y<8&&!enemyOccupied.has(key(p));}));
        reasons.assassins+=wall?(pos.y>=5?2:-5):access?10-Math.abs(pos.x-mean(targets)):0;
      }
    }
    if(enemyTraits.meteor)for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)if(distance(units[i].position,units[j].position)<=1)reasons.spacing-=12;
    if(enemyTraits.windPiercePercent)for(const enemy of enemies.filter(e=>CHAMPIONS[e.type].element==='air'))for(const front of units){
      const dx=Math.sign(front.position.x-enemy.position.x),dy=Math.sign(front.position.y-enemy.position.y);if(!dx&&!dy)continue;
      for(let x=front.position.x+dx,y=front.position.y+dy;x>=0&&x<8&&y>=0&&y<8;x+=dx,y+=dy)if(occupied.has(`${x},${y}`))reasons.spacing-=6;
    }
    // Avoid exposing all carries to the same enemy damage flank even without MAX effects.
    reasons.matchup-=units.filter(isCarry).reduce((sum,u)=>sum+Math.max(0,3-distance(u.position,{x:mean(enemyCarries),y:3})),0);
    formations.push({name,score:Object.values(reasons).reduce((a,b)=>a+b,0),reasons,units});
  }
  formations.sort((a,b)=>b.score-a.score);
  return {units:formations[0].units,decision:{name:formations[0].name,score:formations[0].score,reasons:formations[0].reasons,candidates:formations.map(({name,score})=>({name,score}))}};
}
