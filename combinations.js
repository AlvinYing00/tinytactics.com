// Work on a prospective roster so a purchase either completes fully or changes nothing.
export function combineCopies(roster,type,trackedId){
  const result=roster.map(u=>({...u,stars:u.stars||1,position:{...u.position}}));
  const upgrades=[];
  for(let stars=1;stars<3;stars++){
    let matches;
    while((matches=result.filter(u=>u.type===type&&u.stars===stars)).length>=3){
      // A deployed copy survives on its existing tile; otherwise retain the oldest copy.
      matches.sort((a,b)=>Number(a.position.bench!==undefined)-Number(b.position.bench!==undefined)||a.id-b.id);
      const [survivor,...consumed]=matches.slice(0,3),removed=new Set(consumed.map(u=>u.id));
      if(removed.has(trackedId))trackedId=survivor.id;
      survivor.stars++;
      for(let i=result.length-1;i>=0;i--)if(removed.has(result[i].id))result.splice(i,1);
      upgrades.push({id:survivor.id,type,stars:survivor.stars});
    }
  }
  return {roster:result,unit:result.find(u=>u.id===trackedId),upgrades};
}
