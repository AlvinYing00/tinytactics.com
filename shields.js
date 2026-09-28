// The timed Support layer is part of total shield, consumed before permanent shields.
export function removeSupportShield(unit){
  unit.shield=Math.max(0,unit.shield-(unit.supportShield||0));
  unit.maxShield=Math.max(0,unit.maxShield-(unit.supportShieldMax||0));
  unit.supportShield=unit.supportShieldMax=unit.supportShieldUntil=0;
}
export function grantSupportShield(unit,amount,until){
  removeSupportShield(unit);
  unit.supportShield=unit.supportShieldMax=amount;unit.supportShieldUntil=until;
  unit.shield+=amount;unit.maxShield+=amount;
}
export function absorbShield(unit,amount){
  const absorbed=Math.min(unit.shield,amount);
  unit.supportShield=Math.max(0,(unit.supportShield||0)-absorbed);
  unit.shield-=absorbed;return absorbed;
}
