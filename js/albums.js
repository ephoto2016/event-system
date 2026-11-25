(function(){
'use strict';
const list=document.getElementById('albums'),v=document.getElementById('viewer'),f=document.getElementById('vframe');
let last=null;
const url=id=>'https://drive.google.com/file/d/'+id;
fetch('assets/albums.json').then(r=>r.json()).then(a=>{
  a.forEach(x=>{const b=document.createElement('button');b.className='album';
    b.innerHTML='<span class="ring">♡</span><span class="name"></span><span class="go">צפייה באלבום</span>';
    b.querySelector('.name').textContent=x.title;b.onclick=()=>open(x,b);list.append(b)});
}).catch(()=>{document.querySelector('.albums').hidden=true});
function open(x,b){last=b;f.src=url(x.id)+'/preview';f.title='אלבום '+x.title;
  document.getElementById('vtitle').textContent=x.title;document.getElementById('vopen').href=url(x.id)+'/view';
  v.classList.add('open');v.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';v.querySelector('.vclose').focus()}
function close(){v.classList.remove('open');v.setAttribute('aria-hidden','true');f.src='about:blank';document.body.style.overflow='';last&&last.focus()}
v.querySelector('.vclose').onclick=close;
addEventListener('keydown',e=>{if(e.key==='Escape'&&v.classList.contains('open'))close()});
})();
