/**
 * The fixed script of the wedding's "Rạp phim" layout. It never changes with the page: everything it shows comes from
 * the page's HTML (`data-*` attributes, element ids), so the page's CSP allows it by one hash (`CINEMA_SCRIPT_HASH`,
 * recomputed by the tests). Without it the page still has all its content and its reply form; it only adds the
 * profile screen ("Bạn là khách của ai?"), the greeting of a personal link (`?to=Lan&side=trai`), hiding the other
 * family's events, the moving banner, the per-second countdown, the photo row's viewer, the counter buttons and the
 * ticket "printed" once a reply is sent (it watches for the thank-you `ORDER_SCRIPT` puts in place of the form). With
 * reduced motion it changes nothing over time. Any text it writes goes through `textContent` or is escaped.
 *
 * Written without template literals: the source sits in a `String.raw` template below.
 */
export const CINEMA_SCRIPT = String.raw`(function(){'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var store={get:function(k){try{return sessionStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{sessionStorage.setItem(k,v)}catch(e){}}};
document.documentElement.classList.add('js');

var reveal=$$('[data-reveal]');
if('IntersectionObserver' in window&&!RM){
  var rio=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('is-in');rio.unobserve(en.target)}})},{threshold:0.15});
  reveal.forEach(function(el,i){el.style.transitionDelay=((i%3)*80)+'ms';rio.observe(el)});
}else reveal.forEach(function(el){el.classList.add('is-in')});

var q=new URLSearchParams(location.search);
var guestName=(q.get('to')||'').replace(/[\s\x00-\x1f\x7f-\x9f]+/g,' ').trim().slice(0,80);
var linkSide=q.get('side')==='trai'||q.get('side')==='gai'?q.get('side'):'';
var ofName=function(s){var b=$('.pf[data-side="'+s+'"]');return b?b.getAttribute('data-of')||'':''};
var initial=function(s){return (Array.from(s.trim())[0]||'?').toLocaleUpperCase('vi')};
if(guestName){
  $$('[data-guest-name]').forEach(function(el){el.textContent=guestName});
  $$('[data-guest-lower]').forEach(function(el){el.textContent=guestName});
  $$('[data-guest-initial]').forEach(function(el){el.textContent=initial(guestName)});
}

var pick=$('#pick'),me=$('#me'),main=$('#main'),hello=$('#hello'),sideSet=$('#order [data-from-query="side"]');
var side=linkSide||store.get('rp_side')||'';
function applySide(s){
  side=s;
  var who=guestName||'bạn';
  if(hello)hello.textContent=s&&ofName(s)?'Chào '+who+', khách của '+ofName(s)+'! Suất chiếu này có một ghế dành riêng cho bạn.':'Chào '+who+'! Suất chiếu này có một ghế dành riêng cho bạn.';
  $$('.show').forEach(function(el){var d=el.getAttribute('data-side');el.classList.toggle('is-other',!!s&&!!d&&d!==s)});
  if(sideSet){$$('input',sideSet).forEach(function(r){r.checked=r.value===s});sideSet.classList.toggle('is-hidden',!!linkSide)}
  if(s&&me){
    var av=$('.pf[data-side="'+s+'"] .pf-av'),mine=$('#meAv');
    mine.className=av?av.className+' pf-av--sm':'pf-av pf-av--sm';
    mine.textContent='';
    var letter=av&&$('span',av);
    var span=document.createElement('span');span.textContent=letter?letter.textContent:'?';mine.appendChild(span);
    me.hidden=false;
  }
}
function openPick(){
  pick.hidden=false;pick.classList.remove('is-out');document.body.classList.add('is-picking');main.inert=true;
  $$('.pick-grid li',pick).forEach(function(li,i){li.style.setProperty('--i',i)});
  setTimeout(function(){$('.pf',pick).focus({preventScroll:true})},80);
}
function choose(btn){
  var s=btn.getAttribute('data-side');
  store.set('rp_side',s);applySide(s);btn.classList.add('is-chosen');
  setTimeout(function(){pick.classList.add('is-out');document.body.classList.remove('is-picking');main.inert=false;main.focus({preventScroll:true})},RM?0:380);
  setTimeout(function(){pick.hidden=true;btn.classList.remove('is-chosen')},RM?0:950);
}
if(pick&&main){
  if(guestName)$('#pickSub').textContent=guestName+' ơi, hồ sơ của bạn có sẵn rồi nè';
  if(linkSide){var av=$('.pf[data-side="'+linkSide+'"] .pf-av');if(av){var tag=document.createElement('span');tag.className='pf-tag';tag.textContent='Của bạn';av.appendChild(tag)}}
  $$('.pf',pick).forEach(function(b){b.addEventListener('click',function(){choose(b)})});
  pick.addEventListener('keydown',function(e){
    if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
    var list=$$('.pf',pick),i=list.indexOf(document.activeElement);
    list[(i+(e.key==='ArrowRight'?1:list.length-1))%list.length].focus();
  });
  if(me)me.addEventListener('click',openPick);
  applySide(side);
  if(!store.get('rp_side'))openPick();
}else applySide(linkSide);

var top=$('#top');
if(top){var onScroll=function(){top.classList.toggle('is-solid',scrollY>40)};addEventListener('scroll',onScroll,{passive:true});onScroll()}
var tabs=$$('#tabs a');
if('IntersectionObserver' in window&&tabs.length){
  var tio=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;tabs.forEach(function(a){a.classList.toggle('is-on',a.getAttribute('href')==='#'+en.target.id)})})},{rootMargin:'-45% 0px -50% 0px'});
  tabs.forEach(function(a){var t=document.getElementById(a.getAttribute('href').slice(1));if(t)tio.observe(t)});
}

var slides=$$('#slides .slide'),dots=$('#dots');
if(slides.length>1&&dots){
  slides.forEach(function(){dots.appendChild(document.createElement('i'))});
  var cur=0;
  var show=function(n){
    slides[cur].classList.remove('is-on');dots.children[cur].classList.remove('is-on');
    cur=n%slides.length;
    var img=$('img',slides[cur]);if(img&&img.loading==='lazy')img.loading='eager';
    slides[cur].classList.add('is-on');void dots.children[cur].offsetWidth;dots.children[cur].classList.add('is-on');
  };
  dots.children[0].classList.add('is-on');
  if(!RM)setInterval(function(){if(!document.hidden)show(cur+1)},6000);
}

var cd=$('.countdown[data-at]');
if(cd){
  var at=Date.parse(cd.getAttribute('data-at')),grid=$('.cd-grid',cd),label=$('.cd-label',cd);
  var cells={d:$('[data-cd="d"]',cd),h:$('[data-cd="h"]',cd),m:$('[data-cd="m"]',cd),s:$('[data-cd="s"]',cd)};
  var pad=function(n){return n<10?'0'+n:String(n)};
  var set=function(el,v){if(el.textContent!==v){el.textContent=v;if(!RM){el.classList.remove('tick');void el.offsetWidth;el.classList.add('tick')}}};
  var tick=function(){
    var left=Math.max(0,at-Date.now());
    if(left===0){label.textContent='Suất chiếu đang diễn ra. Cảm ơn bạn đã tới!';grid.hidden=true;return false}
    var s=Math.floor(left/1000);
    set(cells.d,String(Math.floor(s/86400)));set(cells.h,pad(Math.floor(s/3600)%24));set(cells.m,pad(Math.floor(s/60)%60));set(cells.s,pad(s%60));
    return true;
  };
  if(!isNaN(at)&&at>Date.now()){
    grid.hidden=false;label.textContent='Suất chiếu bắt đầu sau';
    if(tick()){var id=setInterval(function(){if(!tick())clearInterval(id)},1000)}
  }
}

var row=$('#row');
if(row){
  var ctl=$('.row-ctl');if(ctl)ctl.hidden=false;
  $$('[data-row]').forEach(function(b){b.addEventListener('click',function(){row.scrollBy({left:Number(b.getAttribute('data-row'))*row.clientWidth*0.8,behavior:RM?'auto':'smooth'})})});
  var tiles=$$('.tile',row),lb=$('#lb'),lbImg=$('#lbImg'),lbCap=$('#lbCap'),now=0,opener=null;
  var go=function(n){
    now=(n+tiles.length)%tiles.length;
    var img=$('img',tiles[now]);
    lbImg.src=tiles[now].getAttribute('href');lbImg.alt=img?img.alt:'';
    lbCap.textContent=(now+1)+'/'+tiles.length+(img&&img.alt?' · '+img.alt:'');
  };
  var close=function(){lb.hidden=true;document.body.classList.remove('is-picking');if(opener)opener.focus()};
  tiles.forEach(function(t,i){t.addEventListener('click',function(e){e.preventDefault();opener=t;go(i);lb.hidden=false;document.body.classList.add('is-picking');$('.lb-x',lb).focus()})});
  lb.addEventListener('click',function(e){
    var k=e.target.closest('[data-lb]');k=k?k.getAttribute('data-lb'):null;
    if(k==='close'||e.target===lb)close();else if(k)go(now+Number(k));
  });
  addEventListener('keydown',function(e){
    if(lb.hidden)return;
    if(e.key==='Escape')close();
    if(e.key==='ArrowRight')go(now+1);
    if(e.key==='ArrowLeft')go(now-1);
  });
  // Not draggable, or the browser cancels the gesture (pointercancel) and the swipe is lost.
  lbImg.draggable=false;
  var x0=null;
  lb.addEventListener('pointerdown',function(e){x0=e.clientX});
  lb.addEventListener('pointercancel',function(){x0=null});
  lb.addEventListener('pointerup',function(e){if(x0===null)return;var dx=e.clientX-x0;x0=null;if(Math.abs(dx)>50)go(now+(dx<0?1:-1))});
}

var form=$('#order'),booking=$('#booking');
if(form&&booking){
  var qty=$('#r-guests'),qtyField=qty&&qty.closest('.field');
  if(qty){
    var box=document.createElement('span');box.className='qty';qty.parentNode.insertBefore(box,qty);
    [['-1','−','Bớt một ghế'],['1','+','Thêm một ghế']].forEach(function(d,i){
      var b=document.createElement('button');b.type='button';b.className='qty-b';b.textContent=d[1];b.setAttribute('aria-label',d[2]);
      b.addEventListener('click',function(){qty.value=String(Math.min(20,Math.max(1,(Number(qty.value)||1)+Number(d[0]))))});
      if(i===0){box.appendChild(b);box.appendChild(qty)}else box.appendChild(b);
    });
  }
  var syncQty=function(){if(qtyField)qtyField.classList.toggle('is-hidden',val('attending')==='no')};
  $$('input[name=attending]',form).forEach(function(r){r.addEventListener('change',syncQty)});
  var val=function(n){var el=form.elements.namedItem(n);return el&&'value' in el?String(el.value):''};
  var sent=null;
  form.addEventListener('submit',function(){
    var s=val('side');
    sent={name:val('name').trim(),yes:val('attending')!=='no',n:Math.max(1,Number(qty&&qty.value)||1),side:s||side};
  });
  var esc=function(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var printTicket=function(){
    var d=booking.dataset,v=sent,slot=$('#ticketSlot');
    if(!v||!slot)return;
    var code=(d.code||'VE')+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
    var seat=v.side==='trai'?'Nhà trai':v.side==='gai'?'Nhà gái':'VIP';
    slot.innerHTML=v.yes
      ?'<div class="ticket"><div class="tk-main"><p class="tk-film">'+esc(d.film||'')+'</p><p class="tk-sub">Suất chiếu duy nhất</p><dl class="tk-grid"><div><dt>Khán giả</dt><dd>'+esc(v.name)+'</dd></div><div><dt>Hàng ghế</dt><dd>'+seat+'</dd></div><div><dt>Ngày</dt><dd>'+esc(d.day||'')+'</dd></div><div><dt>Giờ</dt><dd>'+esc(d.time||'')+'</dd></div></dl></div><div class="tk-stub"><div><b>'+v.n+'</b><span>ghế</span><p class="tk-code">'+esc(code)+'</p></div></div></div>'
      :'<div class="ticket ticket--no"><div class="tk-main"><p class="tk-film">Hẹn dịp khác</p><p class="tk-sub">Đã nhận lời nhắn</p><dl class="tk-grid"><div><dt>Khán giả</dt><dd>'+esc(v.name)+'</dd></div><div><dt>Trạng thái</dt><dd>Không đến được</dd></div></dl></div><div class="tk-stub"><div><b>♥</b><span>cảm ơn</span></div></div></div>';
    var t=$('.ticket',slot);if(t)t.scrollIntoView({behavior:RM?'auto':'smooth',block:'center'});
  };
  if('MutationObserver' in window)new MutationObserver(function(){if($('.order-done',booking)&&!$('.ticket',booking))printTicket()}).observe(booking,{childList:true,subtree:true});
}
})();`;

/** `sha256-…` of CINEMA_SCRIPT for the page's script-src (the tests recompute it). */
export const CINEMA_SCRIPT_HASH = 'sha256-SPQ1+8paCxdohen2mpuTP82ycXY96p4c9jblwyHxsjc=';
