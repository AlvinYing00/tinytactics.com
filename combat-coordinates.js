// Crystal's temporary rows have one empty display row separating them from the board.
export const crystalDisplayY=(y,height=8)=>y===-1?-2:y===height?height+1:y;
export const combatDisplayPoint=(p,height=8)=>({x:p.x,y:crystalDisplayY(p.y,height)});
