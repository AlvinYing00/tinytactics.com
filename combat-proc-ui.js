const ns='http://www.w3.org/2000/svg';
function svg(tag,attributes={}){
  const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));return node;
}
const point=p=>({x:p.x*100+50,y:p.y*100+50});
// Snapshot coordinates keep effects attached to their trigger, even after movement/death.
export function lightningRoute(event){
  const remaining=event.targets.map(p=>({...p})),route=[];let previous=event.from;
  while(remaining.length){
    let next=route.length? -1:remaining.findIndex(p=>p.id===event.targetId);
    if(next<0){let nearest=Infinity;for(let i=0;i<remaining.length;i++){const p=remaining[i],distance=(p.x-previous.x)**2+(p.y-previous.y)**2;if(distance<nearest){nearest=distance;next=i;}}}
    previous=remaining.splice(next,1)[0];route.push(previous);
  }
  return route;
}
export function renderCombatProc(event,layer,speed=1){
  if(!['fire-cracker-burst','electric-strike-chain','dark-death-burst'].includes(event.type))return false;
  const duration=700/Math.sqrt(Math.max(1,speed));
  const group=svg('g',{'class':`combat-proc ${event.type}`,'data-proc':event.type,'aria-hidden':'true','style':`--proc-duration:${duration}ms`});
  if(event.type==='electric-strike-chain'){
    let from=point(event.from);
    for(const [index,target] of lightningRoute(event).entries()){
      const to=point(target),dx=to.x-from.x,dy=to.y-from.y,length=Math.max(1,Math.hypot(dx,dy));
      const points=Array.from({length:9},(_,i)=>{
        const t=i/8,offset=i===0||i===8?0:(i%2?1:-1)*(7+(index+i)%3*4);
        return `${from.x+dx*t-dy/length*offset},${from.y+dy*t+dx/length*offset}`;
      }).join(' ');
      group.append(svg('polyline',{points,'class':'shock-glow'}),svg('polyline',{points,'class':'shock-core'}),svg('circle',{cx:to.x,cy:to.y,r:18,'class':'shock-contact'}));from=to;
    }
  }else{
    const center=point(event),radius=event.radius*100+45,burst=svg('g',{transform:`translate(${center.x} ${center.y})`});
    const aura=svg('g',{'class':'proc-aura'});
    aura.append(svg('circle',{r:radius,'class':'proc-halo'}),svg('circle',{r:radius*.68,'class':'proc-ring'}),svg('circle',{r:radius*.24,'class':'proc-flash'}));
    for(let i=0;i<12;i++){
      const angle=i*Math.PI/6,inner=radius*.45,outer=radius*(i%2?.92:1.12);
      aura.append(svg('line',{x1:Math.cos(angle)*inner,y1:Math.sin(angle)*inner,x2:Math.cos(angle)*outer,y2:Math.sin(angle)*outer,'class':'proc-spark'}));
      aura.append(svg('circle',{cx:Math.cos(angle)*outer,cy:Math.sin(angle)*outer,r:i%2?3:5,'class':'proc-ember'}));
    }
    burst.append(aura);group.append(burst);
  }
  layer.append(group);setTimeout(()=>group.remove(),duration);return true;
}
