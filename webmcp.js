export function registerGameTools(actions,context=globalThis.document?.modelContext){
  if(!context?.registerTool)return null;
  const lifecycle=new AbortController(),empty={type:'object',properties:{},additionalProperties:false};
  const specs=[
    ['read_champion_catalog','Read champion catalog','Read all 65 champions, costs, traits and combat roles.',empty,true,()=>actions.catalog()],
    ['read_battle','Read match','Read round, economy, shop, owned champions, combat and result.',empty,true,()=>actions.snapshot()],
    ['buy_champion','Buy champion','Spend the card price and move one shop card to your bench during preparation.',{type:'object',properties:{slot:{type:'integer',minimum:0,maximum:4}},required:['slot'],additionalProperties:false},false,input=>actions.buy(input.slot)],
    ['refresh_shop','Refresh shop','Spend 2 gold to roll five new cards using current level odds.',empty,false,()=>actions.refresh()],
    ['level_up','Level up','Pay the remaining XP requirement in gold to gain a level; round XP reduces this price.',empty,false,()=>actions.levelUp()],
    ['move_champion','Move or swap champion','Move an owned champion to your board or bench; an occupied destination swaps both champions.',{type:'object',properties:{id:{type:'integer'},x:{type:'integer',minimum:0,maximum:7},y:{type:'integer',minimum:4,maximum:7},bench:{type:'integer',minimum:0,maximum:8}},required:['id'],additionalProperties:false},false,input=>actions.move(input.id,input.bench===undefined?{x:input.x,y:input.y}:{bench:input.bench})],
    ['start_battle','Start battle','Fill open board slots from the bench, favor matching traits, and start combat. No owned champions concedes the round.',empty,false,()=>actions.start()],
    ['next_round','Next round','Continue after a settled round with restored champions and a free new shop.',empty,false,()=>actions.next()]
  ];
  for(const [name,title,description,inputSchema,readOnlyHint,execute] of specs){
    try{Promise.resolve(context.registerTool({name,title,description,inputSchema,annotations:{readOnlyHint,untrustedContentHint:false},execute},{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser integration must never prevent play. */}
  }
  globalThis.addEventListener?.('pagehide',()=>lifecycle.abort(),{once:true});return lifecycle;
}

