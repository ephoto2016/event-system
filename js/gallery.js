(function(){
'use strict';
const $=s=>document.querySelector(s);
const grid=$('#grid'),filters=$('#filters'),lb=$('#lb'),lbimg=$('#lbimg'),count=$('#count'),empty=$('#empty');
const SIZES='(min-width:1100px) 25vw,(min-width:700px) 33vw,50vw';
const BASE='assets/';
let data,tiles=[],visible=[],cur=0,lastFocus=null,active='all';

fetch('assets/gallery.json').then(r=>r.json()).then(init).catch(()=>{$('#photos').hidden=true});

function init(d){
  data=d;if(!d.items.length){$('#photos').hidden=true;return}
  const add=(slug,label,n)=>{const b=document.createElement('button');b.className='chip';b.dataset.cat=slug;
    b.setAttribute('aria-pressed',slug==='all');b.innerHTML=label+'<small>'+n+'</small>';filters.append(b)};
  add('all','הכל',d.items.length);
  d.categories.forEach(c=>add(c.slug,c.label,d.items.filter(i=>i.cat===c.slug).length));
  d.items.forEach((it,i)=>{
    const b=document.createElement('button');b.className='tile';b.dataset.cat=it.cat;
    b.setAttribute('aria-label','פתיחת תמונה '+(i+1));
    b.style.aspectRatio=it.w+'/'+it.h;
    const im=new Image();im.alt=it.alt;im.width=it.w;im.height=it.h;im.decoding='async';
    if(i>7)im.loading='lazy';else im.fetchPriority=i<4?'high':'auto';
    im.srcset=BASE+it.src+'-600.webp 600w,'+BASE+it.src+'-1600.webp 1600w';im.sizes=SIZES;im.src=BASE+it.src+'-600.webp';
    im.onload=()=>im.classList.add('loaded');if(im.complete)im.classList.add('loaded');
    b.append(im);b._it=it;grid.append(b);tiles.push(b);
  });
  layout();apply('all',false);
  addEventListener('resize',layout);
}
// masonry via row spans; aspect ratio known up-front so nothing jumps
function layout(){
  const cs=getComputedStyle(grid),cols=cs.gridTemplateColumns.split(' ').length;
  const gap=parseFloat(cs.columnGap)||10,row=8,w=(grid.clientWidth-gap*(cols-1))/cols;
  tiles.forEach(t=>{const it=t._it;const h=w*it.h/it.w;t.style.gridRowEnd='span '+Math.round((h+gap)/row);t.style.aspectRatio='auto'});
}
function apply(cat,animate){
  active=cat;
  filters.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.cat===cat));
  const run=()=>{tiles.forEach(t=>{t.hidden=!(cat==='all'||t.dataset.cat===cat);t.classList.remove('out')});
    visible=tiles.filter(t=>!t.hidden);empty.hidden=visible.length>0;layout()};
  if(!animate)return run();
  tiles.forEach(t=>t.classList.add('out'));setTimeout(()=>{tiles.forEach(t=>t.classList.add('out'));run();
    tiles.forEach(t=>t.classList.add('out'));requestAnimationFrame(()=>requestAnimationFrame(()=>tiles.forEach(t=>t.classList.remove('out'))))},260);
}
filters.addEventListener('click',e=>{const c=e.target.closest('.chip');if(c&&c.dataset.cat!==active)apply(c.dataset.cat,true)});
grid.addEventListener('click',e=>{const t=e.target.closest('.tile');if(t){lastFocus=t;open(visible.indexOf(t))}});

// lightbox
function show(i){
  cur=(i+visible.length)%visible.length;const it=visible[cur]._it;
  lbimg.classList.add('swap');
  const n=new Image();n.onload=n.onerror=()=>{lbimg.src=n.src;lbimg.alt=it.alt;lbimg.classList.remove('swap')};
  n.src=BASE+it.src+'-1600.webp';
  count.textContent=(cur+1)+' מתוך '+visible.length;
  [cur+1,cur-1].forEach(k=>{const v=visible[(k+visible.length)%visible.length]._it;new Image().src=BASE+v.src+'-1600.webp'});
}
function open(i){lb.classList.add('open');lb.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';lb.querySelector('.close').focus();show(i)}
function close(){lb.classList.remove('open');lb.setAttribute('aria-hidden','true');document.body.style.overflow='';lastFocus&&lastFocus.focus()}
// RTL: "next" is to the left
const next=()=>show(cur+1),prev=()=>show(cur-1);
lb.querySelector('.close').onclick=close;lb.querySelector('.next').onclick=next;lb.querySelector('.prev').onclick=prev;
lb.addEventListener('click',e=>{if(e.target===lb||e.target.tagName==='FIGURE')close()});
addEventListener('keydown',e=>{if(!lb.classList.contains('open'))return;
  if(e.key==='Escape')close();else if(e.key==='ArrowLeft')next();else if(e.key==='ArrowRight')prev();
  else if(e.key==='Tab'){const f=[...lb.querySelectorAll('button')].filter(b=>b.offsetParent);const a=document.activeElement;
    if(e.shiftKey&&a===f[0]){e.preventDefault();f.at(-1).focus()}else if(!e.shiftKey&&a===f.at(-1)){e.preventDefault();f[0].focus()}}});
let sx=0,sy=0;
lb.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
lb.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)dx<0?next():prev();else if(dy>90&&Math.abs(dy)>Math.abs(dx)*1.5)close()},{passive:true});
})();
