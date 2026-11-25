(function(){
'use strict';
const list=document.getElementById('albums'),v=document.getElementById('viewer'),f=document.getElementById('vframe');
let last=null;
const url=id=>'https://drive.google.com/file/d/'+id;
fetch('assets/albums.json').then(r=>r.json()).then(a=>{
  a.forEach(x=>{const b=document.createElement('button');b.className='album';
    b.setAttribute('aria-label','אלבום '+x.title);
    const im=new Image();im.alt='אלבום '+x.title+' - עמוד ראשון';im.loading='lazy';im.decoding='async';
    im.style.objectPosition=x.pos||'50% 40%';
    im.src='https://drive.google.com/thumbnail?id='+x.id+'&sz=w800';
    // אם התמונה לא נטענת: חוזרים לכרטיס עם השם
    im.onerror=()=>{im.remove();b.classList.add('noimg');b.insertAdjacentHTML('beforeend','<span class="name">'+x.title+'</span>')};
    b.append(im);b.onclick=()=>open(x,b);list.append(b)});
}).catch(()=>{document.querySelector('.albums').hidden=true});
function open(x,b){last=b;f.src=url(x.id)+'/preview';f.title='אלבום '+x.title;
  document.getElementById('vtitle').textContent=x.title;document.getElementById('vopen').href=url(x.id)+'/view';
  v.classList.add('open');v.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';v.querySelector('.vclose').focus()}
function close(){v.classList.remove('open');v.setAttribute('aria-hidden','true');f.src='about:blank';document.body.style.overflow='';last&&last.focus()}
v.querySelector('.vclose').onclick=close;
addEventListener('keydown',e=>{if(e.key==='Escape'&&v.classList.contains('open'))close()});
})();
