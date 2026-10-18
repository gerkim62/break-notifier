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
let contentTransition=null;
export function cancelContentTransition(){contentTransition?.();contentTransition=null;}
preference.addEventListener('change',()=>{if(preference.matches)cancelContentTransition();});

// Freeze the departing view before rendering. A closed shadow root keeps the
// inert visual copy out of the live controls, focus order and DOM queries.
export function captureView(node){
 if(!node||reducedMotion())return null;
 const rect=node.getBoundingClientRect(),copy=node.cloneNode(true);
 const originals=[node,...node.querySelectorAll('*')],copies=[copy,...copy.querySelectorAll('*')];
 originals.forEach((original,i)=>{
  const target=copies[i],style=getComputedStyle(original);
  for(const key of style)target.style.setProperty(key,style.getPropertyValue(key));
  target.removeAttribute('id');
 });
 const viewport=node.closest('.schedule-scroll')?.getBoundingClientRect(),top=Math.max(viewport?.top??0,rect.y,0),bottom=Math.min(viewport?.bottom??600,rect.bottom,600);
 Object.assign(copy.style,{margin:'0',width:rect.width+'px',height:rect.height+'px',position:'relative',left:'0',top:rect.y-top+'px',transform:'none'});
 const layer=document.createElement('div');layer.dataset.viewSnapshot='';layer.inert=true;layer.setAttribute('aria-hidden','true');
 Object.assign(layer.style,{position:'fixed',left:rect.x+'px',top:top+'px',width:rect.width+'px',height:Math.max(0,bottom-top)+'px',overflow:'hidden',pointerEvents:'none',zIndex:'40'});
 const shadow=layer.attachShadow({mode:'closed'});shadow.append(copy);
 // Preserve scroll offsets without moving the underlying schedule.
 return {layer,copy,mount(){document.body.append(layer);originals.forEach((original,i)=>{copies[i].scrollTop=original.scrollTop;copies[i].scrollLeft=original.scrollLeft;});}};
}
export function slideView(node,snapshot,direction,{stack=false}={}){
 cancelContentTransition();
 if(!node||reducedMotion())return;
 const distance=node.getBoundingClientRect().width,sign=direction<0?-1:1;
 const timing={duration:360,easing:'cubic-bezier(.22,.8,.25,1)'};
 snapshot?.mount();
 const incomingDistance=distance*(stack&&sign<0 ? .28 : 1),outgoingDistance=distance*(stack&&sign>0 ? .28 : 1);
 const position=node.style.position,zIndex=node.style.zIndex;
 if(stack&&sign>0){node.style.position='relative';node.style.zIndex='41';}
 const incoming=animate(node,[{transform:`translateX(${sign*incomingDistance}px)`},{transform:'translateX(0px)'}],timing);
 const outgoing=snapshot&&animate(snapshot.copy,[{transform:'translateX(0px)'},{transform:`translateX(${-sign*outgoingDistance}px)`}],timing);
 const clean=()=>{incoming?.cancel();outgoing?.cancel();snapshot?.layer.remove();node.style.position=position;node.style.zIndex=zIndex;};
 contentTransition=clean;
 incoming?.finished.catch(()=>{}).finally(()=>{clean();if(contentTransition===clean)contentTransition=null;});
}
