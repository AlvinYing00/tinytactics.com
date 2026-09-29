export function registerGameTools(actions,context=globalThis.document?.modelContext){
  if(!context?.registerTool)return null;
  const lifecycle=new AbortController(),empty={type:'object',properties:{},additionalProperties:false};
  const specs=[
    ['read_champion_catalog','Read champion catalog','Read the 105 shop champions, costs, traits and combat roles.',empty,true,()=>actions.catalog()],
    ['read_battle','Read match','Read round, economy, shop, owned champions, combat and result.',empty,true,()=>actions.snapshot()],
    ['buy_champion','Buy champion','Spend the card price and move one shop card to your bench during preparation.',{type:'object',properties:{slot:{type:'integer',minimum:0,maximum:4}},required:['slot'],additionalProperties:false},false,input=>actions.buy(input.slot)],
    ['refresh_shop','Refresh shop','Spend 2 gold to roll five new cards using current level odds.',empty,false,()=>actions.refresh()],
    ['set_shop_lock','Lock shop for one round','Keep current offers through the next round refresh; the lock resets at round end. Manual rerolls remain available.',{type:'object',properties:{locked:{type:'boolean'}},required:['locked'],additionalProperties:false},false,input=>actions.lock(input.locked)],
    ['level_up','Level up','Pay the remaining XP requirement in gold to gain a level; round XP reduces this price.',empty,false,()=>actions.levelUp()],
    ['move_champion','Move or swap champion','Move an owned champion to your board or bench; an occupied destination swaps both champions.',{type:'object',properties:{id:{type:'integer'},x:{type:'integer',minimum:0,maximum:7},y:{type:'integer',minimum:4,maximum:7},bench:{type:'integer',minimum:0,maximum:8}},required:['id'],additionalProperties:false},false,input=>actions.move(input.id,input.bench===undefined?{x:input.x,y:input.y}:{bench:input.bench})],
    ['start_battle','Start game or Sandbox battle','Start an eight-player Fight match from the lobby, or begin the prepared Sandbox battle. Fight rounds then advance automatically.',empty,false,()=>actions.start()],
    ['next_round','Reset Sandbox round','Restore Sandbox formations after a result. Fight mode progresses automatically and does not allow skipping its timers.',empty,false,()=>actions.next()]
  ];
  for(const [name,title,description,inputSchema,readOnlyHint,execute] of specs){
    try{Promise.resolve(context.registerTool({name,title,description,inputSchema,annotations:{readOnlyHint,untrustedContentHint:false},execute},{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser integration must never prevent play. */}
  }
  globalThis.addEventListener?.('pagehide',()=>lifecycle.abort(),{once:true});return lifecycle;
}

