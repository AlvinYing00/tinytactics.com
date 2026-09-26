// Pointer capture keeps mouse, pen and touch dragging on the same code path.
export function attachBoardDrag({board, getChampion, getView, onStart, onDrop, onCancel, onTap}) {
  let drag=null, suppressClick=false;
  const tileAt=(x,y)=>{
    const tile=document.elementFromPoint(x,y)?.closest('.tile,.bench-slot');
    return tile&&board.contains(tile)?tile:null;
  };
  function clearPreview(){
    board.querySelectorAll('.drop-valid,.drop-swap,.drop-invalid,.drag-origin').forEach(el=>el.classList.remove('drop-valid','drop-swap','drop-invalid','drag-origin'));
    document.querySelectorAll('.swap-target').forEach(el=>el.classList.remove('swap-target'));
  }
  function finish(cancelled=false,event){
    if(!drag)return;
    const current=drag;drag=null;
    const tile=event?tileAt(event.clientX,event.clientY):null;
    current.ghost?.remove();current.view?.classList.remove('drag-source');
    document.body.classList.remove('dragging-champion');clearPreview();
    if(board.hasPointerCapture(current.pointerId))board.releasePointerCapture(current.pointerId);
    if(!current.active){
      // Pointer capture can retarget the browser's click to the board itself.
      if(!cancelled&&tile===current.tile){suppressClick=true;onTap(Number(tile.dataset.x),Number(tile.dataset.y));}
      return;
    }
    suppressClick=true;
    if(cancelled||!tile){onCancel();return;}
    onDrop(current.id,Number(tile.dataset.x),Number(tile.dataset.y));
  }
  board.addEventListener('pointerdown',event=>{
    if(drag||event.button!==0||event.isPrimary===false)return;
    suppressClick=false;
    const tile=event.target.closest('.tile,.bench-slot');if(!tile)return;
    const champion=getChampion(Number(tile.dataset.x),Number(tile.dataset.y));if(!champion)return;
    const view=getView(champion.id);if(!view)return;
    drag={id:champion.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,view,tile,active:false};
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<6)return;
    event.preventDefault();
    if(!drag.active){
      drag.active=true;onStart(drag.id);
      const rect=drag.view.getBoundingClientRect();
      drag.ghost=drag.view.cloneNode(true);drag.ghost.className+=' drag-ghost';
      Object.assign(drag.ghost.style,{width:`${rect.width}px`,height:`${rect.height}px`});
      drag.ghost.setAttribute('aria-hidden','true');document.body.append(drag.ghost);
      drag.view.classList.add('drag-source');document.body.classList.add('dragging-champion');
    }
    Object.assign(drag.ghost.style,{left:`${event.clientX}px`,top:`${event.clientY}px`});
    clearPreview();drag.tile.classList.add('drag-origin');
    const target=tileAt(event.clientX,event.clientY);
    if(target){
      const x=Number(target.dataset.x),y=Number(target.dataset.y),other=getChampion(x,y);
      target.classList.add(y<4?'drop-invalid':other&&other.id!==drag.id?'drop-swap':'drop-valid');
      if(other&&other.id!==drag.id)getView(other.id)?.classList.add('swap-target');
    }
  },{passive:false});
  board.addEventListener('pointerup',event=>{if(drag?.pointerId===event.pointerId){if(drag.active)event.preventDefault();finish(false,event);}});
  board.addEventListener('pointercancel',event=>{if(drag?.pointerId===event.pointerId)finish(true);});
  board.addEventListener('lostpointercapture',event=>{if(drag?.pointerId===event.pointerId)finish(true);});
  board.addEventListener('click',event=>{
    if(suppressClick&&event.detail!==0){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}
  },true);
  window.addEventListener('blur',()=>finish(true));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(true);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')finish(true);});
  return {cancel:()=>finish(true)};
}
