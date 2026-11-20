// =====================================================================
// 🧩 TELEGRAM WIDGETLAR (Bot API 10.4) — chat ichidagi interaktiv kartalar
// Cheklovlar: faqat shaxsiy chatda; HTML ≤ 32 KB va zlib(9) bilan ≤ 4 KB; tarmoq yo'q;
// ma'lumot faqat bot beradigan chat_data (≤ 1024 bayt) orqali keladi.
// Shablonlarga foydalanuvchi matni QO'SHILMAYDI — hammasi chat_data dan textContent bilan chiqadi.
// Ranglar chat mavzusidan olinadi (--tg-theme-*), shuning uchun yorug' va qorong'i rejimda ham to'g'ri ko'rinadi.
// =====================================================================
const zlib = require("zlib");

const BASE_CSS =
  ":root{--a:var(--tg-theme-button-color,#2481cc);--at:var(--tg-theme-button-text-color,#fff);--b2:var(--tg-theme-secondary-bg-color,#f1f3f6);" +
  "--hn:var(--tg-theme-hint-color,#8a8f98);--tx:var(--tg-theme-text-color,#111);--ac:var(--tg-theme-accent-text-color,var(--a))}" +
  "*{box-sizing:border-box;margin:0;padding:0}" +
  "body{font:14px/1.35 system-ui,-apple-system,sans-serif;color:var(--tx);padding:14px 14px calc(18px + var(--tg-content-safe-area-inset-bottom,0px))}" +
  ".s{color:var(--hn);font-size:12px}" +
  ".cd{background:var(--b2);border-radius:16px;padding:12px}" +
  ".bt{border:0;border-radius:12px;min-height:40px;font:600 14px system-ui,sans-serif;background:var(--b2);color:var(--ac)}" +
  ".bp{background:var(--a);color:var(--at)}" +
  ".fx{display:flex;align-items:center}" +
  ".cd .bt{background:var(--tg-theme-bg-color,#fff)}";

// 📊 E'lon statistikasi (egasiga). chat_data: {n,p,a:faolmi,v,t,c,s,d:[7 kun],w:1-kun hafta kuni (0=Du),u}
const STATS_HTML = `<style>${BASE_CSS}
.pl{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 8px;border-radius:20px;background:var(--b2);color:var(--ac)}
.tl{font-size:16px;font-weight:700;margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hr{justify-content:space-between;margin:10px 0 12px}
.bg{font-size:40px;font-weight:800;letter-spacing:-1.5px;line-height:1}
.dl{font-size:13px;font-weight:700;color:var(--ac);background:var(--b2);border-radius:12px;padding:6px 10px}
svg{display:block;width:100%;height:76px;margin-top:8px}
.dy{display:flex;margin-top:4px}.dy span{flex:1;text-align:center;font-size:11px;color:var(--hn)}
.ts{display:flex;gap:8px;margin:10px 0}.ts .cd{flex:1;padding:10px}
.ts b{display:block;font-size:18px;margin-top:2px}
.ac{display:flex;gap:8px}
</style>
<div class="fx" style="justify-content:space-between"><span class="pl" id="st"></span><span class="s" id="u"></span></div>
<div class="tl" id="n"></div><div class="s" id="p"></div>
<div class="fx hr"><div><div class="bg" id="v">…</div><div class="s" style="margin-top:4px">jami ko'rish</div></div><div class="dl" id="t"></div></div>
<div class="cd"><div class="fx" style="justify-content:space-between"><b style="font-size:13px">Oxirgi 7 kun</b><span class="s" id="wk"></span></div>
<svg id="ch" viewBox="0 0 280 76" preserveAspectRatio="none"></svg><div class="dy" id="dy"></div></div>
<div class="ts"><div class="cd"><span class="s">📞 Qo'ng'iroq</span><b id="c"></b></div><div class="cd"><span class="s">❤️ Saqlagan</span><b id="sv"></b></div><div class="cd"><span class="s">🎯 Qiziqish</span><b id="cv"></b></div></div>
<div class="ac"><button class="bt bp" style="flex:2" onclick="go('p')">🚀 E'lonni ko'tarish</button><button class="bt" style="flex:1" onclick="go('r')">↻ Yangilash</button></div>
<script>
var W=TelegramWidget,D=["Du","Se","Ch","Pa","Ju","Sh","Ya"];
function $(i){return document.getElementById(i)}
function f(n){return String(n||0).replace(/\\B(?=(\\d{3})+(?!\\d))/g," ")}
function draw(){var d={};try{d=JSON.parse(W.chatData||"{}")}catch(e){}
$("st").textContent=d.a===0?"○ Faol emas":"● Faol";$("n").textContent=d.n||"";$("p").textContent=d.p||"";
$("v").textContent=f(d.v);$("t").textContent=d.t?"▲ +"+f(d.t)+" bugun":"Bugun hali yo'q";
$("c").textContent=f(d.c);$("sv").textContent=f(d.s);$("cv").textContent=d.v?Math.round((d.c||0)/d.v*100)+"%":"—";
var a=d.d||[],m=1,i,s='<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--a);stop-opacity:.35"/></linearGradient></defs>',dy="",sum=0;
for(i=0;i<a.length;i++){sum+=a[i];if(a[i]>m)m=a[i]}
for(i=0;i<a.length;i++){var h=Math.max(4,Math.round(a[i]/m*58)),x=i*40+6,l=i==a.length-1;
s+='<rect x="'+x+'" y="'+(76-h)+'" width="28" height="'+h+'" rx="7" style="fill:'+(l?"var(--a)":"url(#g)")+';opacity:'+(l?1:.55)+'"/>';
if(a[i])s+='<text x="'+(x+14)+'" y="'+(70-h)+'" text-anchor="middle" style="font:600 11px system-ui;fill:'+(l?"var(--ac)":"var(--hn)")+'">'+a[i]+"</text>";
dy+="<span>"+(l?"Bugun":D[((d.w||0)+i)%7])+"</span>"}
$("ch").innerHTML=s;$("dy").innerHTML=dy;$("wk").textContent=f(sum)+" ko'rish";$("u").textContent=d.u?"↻ "+d.u:""}
function go(k){if(W.HapticFeedback)W.HapticFeedback.impactOccurred("light");$("u").textContent="⏳";
W.request(k).then(function(r){$("u").textContent=r&&r.result?r.result:""},function(){$("u").textContent="Birozdan keyin urinib ko'ring"})}
W.onEvent("chatDataChanged",draw);draw();if(W.ready)W.ready();
</script>`;

// 🧮 Kredit kalkulyatori. chat_data: {p:narx,d:boshlang'ich,m:oy,r:foiz,c:"$"|"so'm"}
// Hisob widgetning o'zida (botga so'rov yubormaydi); o'zgartirishlar shu qurilmada saqlanadi.
const CALC_HTML = `<style>${BASE_CSS}
.hero{background:var(--a);color:var(--at);border-radius:18px;padding:14px 16px}
.hero .s{color:var(--at);opacity:.8}
.mo{font-size:36px;font-weight:800;letter-spacing:-1px;line-height:1.1;margin:2px 0}
.br{display:flex;height:8px;border-radius:6px;overflow:hidden;margin:12px 0 8px}
.lg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--hn)}
.lg i{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:4px}
.rw{justify-content:space-between;padding:10px 0}
.rw+.rw{border-top:1px solid rgba(128,128,128,.18)}
.sp .bt{width:36px;min-height:36px;font-size:18px}
.sp b{min-width:52px;text-align:center;font-size:16px}
.sg{display:flex;gap:4px;margin-top:8px}
.sg .bt{flex:1;min-height:34px;font-size:13px;padding:0;color:var(--tx)}
.sg .on{background:var(--a);color:var(--at)}
</style>
<div class="hero"><span class="s">Oylik to'lov</span><div class="mo" id="mo"></div><span class="s" id="hs"></span></div>
<div class="br" id="br"></div><div class="lg" id="lg"></div>
<div class="cd" style="margin-top:12px;padding:2px 12px">
<div class="fx rw"><div><b>Boshlang'ich to'lov</b><div class="s" id="ds"></div></div><div class="fx sp"><button class="bt" onclick="ch('d',-5)">−</button><b id="dv"></b><button class="bt" onclick="ch('d',5)">+</button></div></div>
<div class="rw"><div class="fx" style="justify-content:space-between"><b>Muddat</b><span class="s" id="mv"></span></div><div class="sg" id="mm"></div></div>
<div class="fx rw"><div><b>Yillik foiz</b><div class="s">0% — foizsiz</div></div><div class="fx sp"><button class="bt" onclick="ch('r',-1)">−</button><b id="rv"></b><button class="bt" onclick="ch('r',1)">+</button></div></div>
</div>
<div class="fx" style="justify-content:space-between;margin-top:10px"><span class="s" id="pr"></span><button class="bt" style="min-height:30px;padding:0 10px;font-size:12px" onclick="rs()">↺ Asl holat</button></div>
<script>
var W=TelegramWidget,S,B,M=[6,12,18,24,36,48,60];
function $(i){return document.getElementById(i)}
function f(n){return String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g," ")}
function base(){var d={};try{d=JSON.parse(W.chatData||"{}")}catch(e){}var p=+d.p||0;
return{p:p,d:p?Math.min(90,Math.max(0,Math.round((+d.d||0)/p*100))):0,m:+d.m||12,r:+d.r||0,c:d.c||"$"}}
function load(){B=base();S=B;try{var x=JSON.parse(localStorage.getItem("k")||"null");if(x&&x.p==B.p)S={p:B.p,d:x.d,m:x.m,r:x.r,c:B.c}}catch(e){}}
function save(){try{localStorage.setItem("k",JSON.stringify(S))}catch(e){}}
function ch(k,v){S[k]=Math.min(k=="d"?90:60,Math.max(0,S[k]+v));save();draw();if(W.HapticFeedback)W.HapticFeedback.selectionChanged()}
function sm(m){S.m=m;save();draw();if(W.HapticFeedback)W.HapticFeedback.selectionChanged()}
function rs(){S=base();try{localStorage.removeItem("k")}catch(e){}draw()}
function draw(){var c=" "+S.c,p=S.p,dw=p*S.d/100,l=p-dw,n=S.m,r=S.r/1200,mo=r?l*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1):l/n,o=mo*n-l,T=dw+l+o||1;
$("mo").textContent=p?f(mo)+c:"—";$("hs").textContent=n+" oy · "+(S.r?S.r+"% yillik":"foizsiz")+" · jami "+f(dw+mo*n)+c;
var seg=[[dw,"#34c759","Boshlang'ich"],[l,"var(--a)","Kredit"],[o,"#ff9500","Ustama"]],b="",g="";
for(var i=0;i<3;i++)if(seg[i][0]>0){b+='<div style="width:'+(seg[i][0]/T*100)+'%;background:'+seg[i][1]+'"></div>';g+='<span><i style="background:'+seg[i][1]+'"></i>'+seg[i][2]+" "+f(seg[i][0])+c+"</span>"}
$("br").innerHTML=b;$("lg").innerHTML=g;
$("dv").textContent=S.d+"%";$("ds").textContent=f(dw)+c;$("rv").textContent=S.r+"%";$("mv").textContent=n+" oy";$("pr").textContent="🚗 Narxi: "+f(p)+c;
var ms=M.indexOf(n)<0?M.concat([n]).sort(function(a,b){return a-b}):M,h="";
for(i=0;i<ms.length;i++)h+='<button class="bt'+(ms[i]==n?" on":"")+'" onclick="sm('+ms[i]+')">'+ms[i]+"</button>";
$("mm").innerHTML=h}
W.onEvent("chatDataChanged",function(){load();draw()});load();draw();if(W.ready)W.ready();
</script>`;

// 👨‍💻 Admin jonli paneli. chat_data: {q:[e'lon,tahrir,to'lov,salon,UP/sotildi,diler],u:[jami,bugun],a:[faol,bugun],v:ko'rish,vu:kishi,d:[7 kun],w,p:[prem,vip,top,shosh],i:daromad30,m:texnik(0/1),t:vaqt}
const ADMIN_HTML = `<style>${BASE_CSS}
.pl{font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;background:var(--b2);color:#34c759}
.pl.mt{color:#ff9500}
.qc{background:var(--a);color:var(--at);border-radius:18px;padding:12px 14px;margin-top:10px}
.qc .s{color:var(--at);opacity:.8}
.qn{font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1.1}
.qs{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.qs span{font-size:12px;font-weight:600;border-radius:10px;padding:3px 8px;background:rgba(255,255,255,.2)}
.gr{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.gr .cd{width:calc(50% - 4px);padding:10px}
.gr b{display:block;font-size:20px;margin-top:2px}.gr i{font-style:normal;font-size:12px;color:#34c759;font-weight:600}
svg{display:block;width:100%;height:48px;margin-top:6px}
.pr{display:flex;gap:6px;margin:10px 0}.pr span{flex:1;text-align:center;background:var(--b2);border-radius:10px;padding:6px 2px;font-size:11px;color:var(--hn)}.pr b{display:block;font-size:16px;color:var(--tx)}
.ac{display:flex;gap:8px}
</style>
<div class="fx" style="justify-content:space-between"><b style="font-size:16px">👨‍💻 Admin paneli</b><span class="pl" id="m"></span></div>
<div class="s" id="t"></div>
<div class="qc"><span class="s">Kutayotgan so'rovlar</span><div class="qn" id="qt"></div><div class="qs" id="qs"></div></div>
<div class="gr"><div class="cd"><span class="s">👥 Foydalanuvchi</span><b id="u"></b><i id="ut"></i></div><div class="cd"><span class="s">🚗 Faol e'lon</span><b id="a"></b><i id="at"></i></div>
<div class="cd"><span class="s">👁 Bugun ko'rish</span><b id="v"></b><i id="vu" style="color:var(--hn)"></i></div><div class="cd"><span class="s">💰 Daromad, 30 kun</span><b id="i"></b><i style="color:var(--hn)">so'm</i></div></div>
<div class="cd"><div class="fx" style="justify-content:space-between"><b style="font-size:13px">Ko'rishlar, 7 kun</b><span class="s" id="sm"></span></div><svg id="ch" viewBox="0 0 280 48" preserveAspectRatio="none"></svg></div>
<div class="pr" id="pr"></div>
<div class="ac"><button class="bt bp" style="flex:2" onclick="go('q')">📥 Navbatni ochish</button><button class="bt" style="flex:1" onclick="go('r')">↻ Yangilash</button></div>
<script>
var W=TelegramWidget,Q=["E'lon","Tahrir","To'lov","Salon","UP/Sotildi","Diler"];
function $(i){return document.getElementById(i)}
function f(n){return String(Math.round(n||0)).replace(/\\B(?=(\\d{3})+(?!\\d))/g," ")}
function draw(){var d={};try{d=JSON.parse(W.chatData||"{}")}catch(e){}
var q=d.q||[],t=0,h="",i;for(i=0;i<q.length;i++){t+=q[i];if(q[i])h+="<span>"+Q[i]+" "+q[i]+"</span>"}
$("qt").textContent=t?t:"0 ✓";$("qs").innerHTML=h||"<span>Hammasi ko'rib chiqilgan</span>";
var m=$("m");m.textContent=d.m?"🛠 Texnik ishlar":"● Bot ishlayapti";m.className="pl"+(d.m?" mt":"");
var u=d.u||[],a=d.a||[];$("u").textContent=f(u[0]);$("ut").textContent=u[1]?"+"+u[1]+" bugun":"";$("a").textContent=f(a[0]);$("at").textContent=a[1]?"+"+a[1]+" bugun":"";
$("v").textContent=f(d.v);$("vu").textContent=f(d.vu)+" kishi";$("i").textContent=f(d.i);$("t").textContent=d.t?"↻ "+d.t:"";
var s=d.d||[],mx=1,g="",sm=0;for(i=0;i<s.length;i++){sm+=s[i];if(s[i]>mx)mx=s[i]}
for(i=0;i<s.length;i++){var hh=Math.max(3,Math.round(s[i]/mx*44));g+='<rect x="'+(i*40+6)+'" y="'+(48-hh)+'" width="28" height="'+hh+'" rx="6" style="fill:var(--a);opacity:'+(i==s.length-1?1:.4)+'"/>'}
$("ch").innerHTML=g;$("sm").textContent=f(sm)+" jami";
var p=d.p||[],L=["💎 Premium","🌟 VIP","⬆️ TOP","🚨 Shosh."],x="";for(i=0;i<4;i++)x+="<span>"+L[i]+" <b>"+(p[i]||0)+"</b></span>";$("pr").innerHTML=x}
function go(k){if(W.HapticFeedback)W.HapticFeedback.impactOccurred("light");$("t").textContent="⏳";
W.request(k).then(function(r){$("t").textContent=r&&r.result?r.result:""},function(){$("t").textContent="Birozdan keyin urinib ko'ring"})}
W.onEvent("chatDataChanged",draw);draw();if(W.ready)W.ready();
</script>`;

function sizeInfo(html) {
  return { raw: Buffer.byteLength(html, "utf8"), z: zlib.deflateSync(Buffer.from(html, "utf8"), { level: 9 }).length };
}

module.exports = { STATS_HTML, CALC_HTML, ADMIN_HTML, sizeInfo };
