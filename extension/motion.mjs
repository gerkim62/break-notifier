// Shared, interruptible motion for the picker, filter underline and countdown.
// Capture the displayed position before a render so rapid input retargets from
// the current frame, rather than restarting from the previous destination.
export const motionTiming={duration:380,easing:'cubic-bezier(.22,1,.36,1)'};
const preference=matchMedia('(prefers-reduced-motion: reduce)'),running=new Set();
export const reducedMotion=()=>preference.matches;
preference.addEventListener('change',()=>{if(preference.matches)for(const animation of running){animation.finish();animation.cancel();} });
export function animate(node,frames,options=motionTiming){
 if(!node||reducedMotion())return;
 const animation=node.animate(frames,options);running.add(animation);
 animation.finished.catch(()=>{}).finally(()=>running.delete(animation));return animation;
}
export function captureMotion(root){
 return [...root.querySelectorAll('#thumb,.filter-underline,#shared-countdown')].map(node=>({node,from:getComputedStyle(node).transform,target:node.style.transform}));
}
export function restoreMotion(snapshot){
 for(const {node,from,target} of snapshot){
  if(!node.isConnected||node.hidden||target===node.style.transform)continue;
  node.getAnimations().forEach(animation=>animation.cancel());
  if(from!=='none')animate(node,[{transform:from},{transform:node.style.transform}]);
 }
}
// Replacing content has no spatial direction. Keep the layout still and use
// only a short dissolve; selection and countdown motion retain real targets.
export function fadeContent(node,{duration=120}={}){
 animate(node,[{opacity:.65},{opacity:1}],{duration,easing:'ease-out'});
}
