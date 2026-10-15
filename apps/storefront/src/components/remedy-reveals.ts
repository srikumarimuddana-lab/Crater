/** Observe newly rendered sections as well as the initial page, without watching our own classes. */
export function watchReveals(root:HTMLElement,media:MediaQueryList):()=>void {
  if(typeof IntersectionObserver==='undefined'||typeof MutationObserver==='undefined')return ()=>root.classList.remove('motion-ready');
  let active=true;
  const observer=new IntersectionObserver(entries=>{
    if(!active)return;
    for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}
  },{threshold:.08});
  const observe=()=>{
    if(!active||media.matches)return;
    root.querySelectorAll<HTMLElement>('.reveal').forEach(node=>{if(!node.classList.contains('visible'))observer.observe(node);});
  };
  const change=()=>{
    if(media.matches)root.classList.remove('motion-ready');
    else{root.classList.add('motion-ready');observe();}
  };
  const mutations=new MutationObserver(observe);
  mutations.observe(root,{childList:true,subtree:true});
  media.addEventListener('change',change);
  change();
  return ()=>{active=false;observer.disconnect();mutations.disconnect();media.removeEventListener('change',change);root.classList.remove('motion-ready');};
}
