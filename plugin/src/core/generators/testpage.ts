import { BuildInput, escapeHtml, ns, strokeSteps, symbolId, policyOf } from './common'
import { inlineSprite } from './svg-files'

const CSS = String.raw`
:root{color-scheme:light;--bg:#f6f7f9;--panel:#fff;--text:#1b1d21;--muted:#6b7280;--line:#e5e7eb;--accent:#4f46e5;--accent-soft:#eef2ff;--warn:#b45309;--err:#b91c1c;--card:#fff;--stage:#fff}
:root[data-theme=dark]{color-scheme:dark;--bg:#0f1115;--panel:#171a21;--text:#e8eaed;--muted:#9aa3b2;--line:#272c36;--accent:#8b93ff;--accent-soft:#1f2340;--warn:#f5b455;--err:#ff8a8a;--card:#171a21;--stage:#171a21}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--panel);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
h1{font-size:15px;margin:0 8px 0 0}
.count{color:var(--muted);font-size:12px}
input,select,button{font:inherit;color:inherit}
.search{flex:1 1 240px;min-width:180px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.search:focus,select:focus,button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
select{padding:7px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
label.chk{display:inline-flex;gap:6px;align-items:center;color:var(--muted);font-size:13px}
.tools{display:flex;flex-wrap:wrap;gap:14px;align-items:center;padding:10px 16px;background:var(--panel);border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}
.tools label{display:inline-flex;gap:6px;align-items:center}
.tools input[type=range]{width:110px}
.tools input[type=color]{width:28px;height:22px;padding:0;border:1px solid var(--line);border-radius:4px;background:none}
.tools button{padding:4px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);cursor:pointer}
main{padding:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px}
.grp{font-size:13px;margin:22px 0 10px;display:flex;gap:8px;align-items:center}.grp:first-child{margin-top:0}
.count{color:var(--muted);font-size:12px}
.card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);cursor:pointer;text-align:center}
.card:hover{border-color:var(--accent)}
.card[aria-pressed=true]{border-color:var(--accent);background:var(--accent-soft)}
.stage{height:calc(var(--stage-size,32px) + 8px);display:flex;align-items:center;justify-content:center}
.card .name{font-size:12px;word-break:break-all}
.badges{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;min-height:16px}
.badge{font-size:10px;padding:1px 6px;border-radius:999px;background:var(--bg);border:1px solid var(--line);color:var(--muted)}
.badge.warn{color:var(--warn);border-color:var(--warn)}.badge.error{color:var(--err);border-color:var(--err)}
mark{background:#fde68a;color:#000;border-radius:2px}
.empty{padding:48px;text-align:center;color:var(--muted)}
aside{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);background:var(--panel);border-left:1px solid var(--line);box-shadow:-8px 0 24px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .15s;overflow:auto;padding:16px;z-index:10}
aside.open{transform:none}
@media (prefers-reduced-motion:reduce){aside{transition:none}}
aside h2{margin:0 0 4px;font-size:16px}aside h3{margin:16px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.close{float:right;border:1px solid var(--line);background:var(--bg);border-radius:6px;padding:2px 8px;cursor:pointer}
.sizes{display:flex;gap:16px;align-items:flex-end;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--stage)}
.snip{display:flex;gap:6px;margin:6px 0}
.snip code{flex:1;display:block;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);font:12px ui-monospace,Menlo,monospace;overflow:auto;white-space:nowrap}
.snip button{border:1px solid var(--line);background:var(--bg);border-radius:6px;padding:0 10px;cursor:pointer}
.finding{font-size:12px;margin:4px 0;padding:6px 8px;border-radius:6px;border:1px solid var(--line)}
.finding.warn{border-color:var(--warn)}.finding.error{border-color:var(--err)}
.slot{display:flex;gap:8px;align-items:center;font-size:12px;margin:3px 0}.sw{width:14px;height:14px;border-radius:3px;border:1px solid var(--line)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:6px 12px;border-radius:8px;font-size:12px;opacity:0;pointer-events:none;transition:opacity .15s}
.toast.show{opacity:1}
@media (forced-colors:active){.card,.badge,aside{border:1px solid CanvasText}}
`

const JS = String.raw`
(function(){
var NS='__NS__';
var STROKE=JSON.parse(document.getElementById('stroke').textContent);
var DATA=JSON.parse(document.getElementById('data').textContent);
var $=function(id){return document.getElementById(id)};
var state={q:'',kind:'',cat:'',warn:false,sel:null,group:false};
var root=document.documentElement;
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function hl(text,q){var t=esc(text);if(!q)return t;var i=text.toLowerCase().indexOf(q);if(i<0)return t;return esc(text.slice(0,i))+'<mark>'+esc(text.slice(i,i+q.length))+'</mark>'+esc(text.slice(i+q.length))}
function matches(d){
  if(state.kind&&d.kind!==state.kind)return false;
  if(state.cat&&d.category!==state.cat)return false;
  if(state.warn&&!d.findings.length)return false;
  if(!state.q)return true;
  var hay=(d.name+' '+d.category+' '+d.tags.join(' ')+' '+d.layer).toLowerCase();
  return state.q.split(/\s+/).every(function(w){return hay.indexOf(w)>=0});
}
function worst(d){return d.findings.some(function(f){return f.severity==='error'})?'error':d.findings.some(function(f){return f.severity==='warn'})?'warn':''}
function icon(d,cls){return '<svg class="'+NS+'-icon'+(cls?' '+cls:'')+'" aria-hidden="true" focusable="false"><use href="#'+NS+'-'+d.name+'"/></svg>'}
function render(){
  var list=DATA.filter(matches);
  $('count').textContent=list.length+' of '+DATA.length+' icons';
  var g=$('grid');
  if(!list.length){g.innerHTML='';$('empty').hidden=false;return}
  $('empty').hidden=true;
  var groups=state.group?groupBy(list):[{label:'',items:list}];
  g.innerHTML=groups.map(function(grp){return (grp.label?'<h2 class="grp">'+esc(grp.label)+' <span class="count">'+grp.items.length+'</span></h2>':'')+'<div class="grid">'+grp.items.map(card).join('')+'</div>'}).join('');
}
function groupBy(list){var m={},order=[];list.forEach(function(d){var k=d.category||'Uncategorised';if(!m[k]){m[k]=[];order.push(k)}m[k].push(d)});order.sort(function(a,b){return a==='Uncategorised'?1:b==='Uncategorised'?-1:a.localeCompare(b)});return order.map(function(k){return {label:k,items:m[k]}})}
function card(d){
    var w=worst(d);
    return '<button class="card" data-n="'+esc(d.name)+'" aria-pressed="'+(state.sel===d.name)+'" title="'+esc(d.layer)+'">'
      +'<span class="stage">'+icon(d)+'</span>'
      +'<span class="name">'+hl(d.name,state.q.split(/\s+/)[0])+'</span>'
      +'<span class="badges"><span class="badge">'+d.kind+'</span>'+(w?'<span class="badge '+w+'">'+d.findings.length+' '+(w==='error'?'error':'alert')+(d.findings.length>1?'s':'')+'</span>':'')+(d.usage?'<span class="badge" title="Placed '+d.usage.instances+' times">×'+d.usage.instances+'</span>':'')+'</span></button>';
}
function copy(text){
  function done(){var t=$('toast');t.classList.add('show');setTimeout(function(){t.classList.remove('show')},1200)}
  function fallback(){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(ta);done()}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,fallback)}else fallback();
}
function snip(label,code){return '<div class="snip" title="'+esc(label)+'"><code>'+esc(code)+'</code><button data-copy="'+esc(code)+'" aria-label="Copy '+esc(label)+'">Copy</button></div>'}
function open(name){
  var d=DATA.filter(function(x){return x.name===name})[0];if(!d)return;
  state.sel=name;history.replaceState(null,'','#'+encodeURIComponent(state.q)+(name?'&'+encodeURIComponent(name):''));
  var h='<button class="close" id="close" aria-label="Close">Close</button><h2>'+esc(d.name)+'</h2><div class="count">'+esc(d.id)+' · '+d.kind+' · '+d.width+'×'+d.height+'</div>';
  h+='<h3>Preview</h3><div class="sizes">'+[16,24,32,48,64].map(function(s){return '<span style="--'+NS+'-icon-size:'+s+'px;text-align:center">'+icon(d)+'<div class="count">'+s+'</div></span>'}).join('')+'</div>';
  h+='<h3>Code</h3>'+snip('Sprite (HTML)','<svg class="'+NS+'-icon" aria-hidden="true" focusable="false"><use href="'+NS+'-sprite.svg#'+NS+'-'+d.name+'"/></svg>');
  if(d.mask)h+=snip('Mask class','<i class="'+NS+'-icon '+NS+'-icon--'+d.name+'" aria-hidden="true"></i>');
  h+=snip('Angular','<'+NS+'-icon name="'+d.name+'" />')+snip('Name',d.name)+snip('File','svg/'+NS+'-'+d.name+'.svg');
  if(d.slots.length){h+='<h3>Colour slots</h3>'+d.slots.map(function(s){return '<div class="slot"><span class="sw" style="background:'+s.hex+'"></span><code>'+esc(s.cssVar)+'</code>'+(s.token?'<span>→ '+esc(s.token)+'</span>':'')+(s.variable?'<span class="count">('+esc(s.variable)+')</span>':'')+'</div>'}).join('')}
  if(d.strokeWidth!==null)h+='<h3>Stroke</h3><div class="slot">drawn at '+d.strokeWidth+'px → <code>--'+NS+'-icon-stroke-width</code></div>';
  if(d.category)h+='<h3>Category</h3><div class="count">'+esc(d.category)+'</div>';
  if(d.usage){h+='<h3>In use</h3><div class="count">'+d.usage.instances+' instance(s)'+(d.usage.remote?' from a linked library':'')+(d.usage.sizes.length?' · sizes '+esc(d.usage.sizes.join(', ')):'')+'</div>';var ov=Object.keys(d.usage.overrides);if(ov.length)h+='<div class="count">Overrides: '+ov.map(function(k){return esc(k)+' ×'+d.usage.overrides[k]}).join(', ')+'</div>'}
  if(d.tags.length)h+='<h3>Tags</h3><div class="count">'+d.tags.map(esc).join(', ')+'</div>';
  h+='<h3>Source</h3><div class="count">'+esc(d.layer)+' · page “'+esc(d.page)+'” · '+esc(d.source)+'</div>';
  h+='<h3>Audit</h3>'+(d.findings.length?d.findings.map(function(f){return '<div class="finding '+f.severity+'"><b>'+f.severity+'</b> · '+esc(f.message)+'</div>'}).join(''):'<div class="count">No findings.</div>');
  var a=$('drawer');a.innerHTML=h;a.classList.add('open');a.setAttribute('aria-hidden','false');
  render();$('close').focus();
}
function closeDrawer(){state.sel=null;var a=$('drawer');a.classList.remove('open');a.setAttribute('aria-hidden','true');render()}
$('grid').addEventListener('click',function(e){var b=e.target.closest('.card');if(b)open(b.getAttribute('data-n'))});
$('drawer').addEventListener('click',function(e){
  if(e.target.id==='close')closeDrawer();
  var c=e.target.getAttribute&&e.target.getAttribute('data-copy');if(c)copy(c);
});
$('q').addEventListener('input',function(e){state.q=e.target.value.trim().toLowerCase();history.replaceState(null,'','#'+encodeURIComponent(state.q));render()});
$('kind').addEventListener('change',function(e){state.kind=e.target.value;render()});
$('cat').addEventListener('change',function(e){state.cat=e.target.value;render()});
$('warn').addEventListener('change',function(e){state.warn=e.target.checked;render()});
$('group').addEventListener('change',function(e){state.group=e.target.checked;render()});
document.addEventListener('keydown',function(e){
  if(e.key==='/'&&document.activeElement!==$('q')){e.preventDefault();$('q').focus()}
  else if(e.key==='Escape'){if(state.sel)closeDrawer();else if(document.activeElement===$('q')){$('q').blur()}}
});
function setVar(name,val){if(val===null)root.style.removeProperty(name);else root.style.setProperty(name,val)}
function strokeFor(px){var w=null;STROKE.table.forEach(function(s){if(w===null||s.size<=px)w=s.weight});return w}
function applySize(px){setVar('--'+NS+'-icon-size',px+'px');root.style.setProperty('--stage-size',px+'px');if(STROKE.policy==='table'){var w=strokeFor(px);if(w!==null){setVar('--'+NS+'-icon-stroke-width',w);$('sw').value=w;$('swv').textContent=w+'px (from table)'}}}
$('size').addEventListener('input',function(e){applySize(Number(e.target.value))});
$('c1').addEventListener('input',function(e){setVar('--'+NS+'-icon-color',e.target.value)});
$('c2').addEventListener('input',function(e){setVar('--'+NS+'-icon-color-2',e.target.value)});
$('c3').addEventListener('input',function(e){setVar('--'+NS+'-icon-color-3',e.target.value)});
$('sw').addEventListener('input',function(e){setVar('--'+NS+'-icon-stroke-width',e.target.value);$('swv').textContent=e.target.value+'px'});
$('theme').addEventListener('change',function(e){root.setAttribute('data-theme',e.target.value)});
$('reset').addEventListener('click',function(){['size','c1','c2','c3','sw'].forEach(function(id){});['--'+NS+'-icon-size','--'+NS+'-icon-color','--'+NS+'-icon-color-2','--'+NS+'-icon-color-3','--'+NS+'-icon-stroke-width','--stage-size'].forEach(function(n){root.style.removeProperty(n)});$('size').value=32;applySize(32)});
// init
var cats={};DATA.forEach(function(d){if(d.category)cats[d.category]=1});
$('cat').innerHTML='<option value="">All categories</option>'+Object.keys(cats).sort().map(function(c){return '<option>'+esc(c)+'</option>'}).join('');
if(!Object.keys(cats).length){$('cat').hidden=true;$('groupLbl').hidden=true}else{state.group=Object.keys(cats).length>1;$('group').checked=state.group}
var hash=decodeURIComponent(location.hash.slice(1)).split('&');
if(hash[0]){state.q=hash[0].toLowerCase();$('q').value=hash[0]}
applySize(32);
$('swp').textContent=STROKE.policy==='scale'?'scales with icon':STROKE.policy==='table'?'by size table':'constant px';
render();
if(hash[1])open(decodeURIComponent(hash[1]));
})();
`

export function testPage(b: BuildInput): string {
  const n = ns(b)
  const data = b.icons.map((i) => ({
    id: `${n}:${i.name}`,
    name: i.name,
    category: i.categoryLabel,
    usage: i.usage ? { instances: i.usage.instances, remote: i.usage.remote, sizes: i.usage.sizes, overrides: i.usage.overrides } : null,
    kind: i.kind,
    tags: i.tags,
    layer: i.layerName,
    page: i.pageName,
    source: i.sourceKind,
    width: i.width,
    height: i.height,
    mask: !!i.maskSvg,
    strokeWidth: i.strokeWidth,
    slots: i.slots.map((s) => ({ cssVar: s.cssVar, hex: s.hex, token: s.token ?? null, variable: s.variable ?? null })),
    findings: i.findings.map((f) => ({ severity: f.severity, message: f.message }))
  }))
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const firstSymbol = b.icons[0] ? symbolId(b, b.icons[0]) : ''
  void firstSymbol
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(n)} icons</title>
<style>${CSS}
.${n}-icon{display:inline-block;width:var(--${n}-icon-size,1em);height:var(--${n}-icon-size,1em);flex:none;fill:none;vertical-align:-0.125em}
</style>
</head>
<body>
${inlineSprite(b)}
<header>
  <h1>${escapeHtml(n)} icons</h1>
  <label class="sr" for="q">Search icons</label>
  <input class="search" id="q" type="search" placeholder="Search name, tag, category…  ( / )" autocomplete="off">
  <select id="kind" aria-label="Kind"><option value="">All kinds</option><option>filled</option><option>stroked</option><option>multicolor</option><option>mixed</option></select>
  <select id="cat" aria-label="Category"></select>
  <label class="chk"><input id="warn" type="checkbox"> With alerts</label>
  <label class="chk" id="groupLbl"><input id="group" type="checkbox"> Group by category</label>
  <span class="count" id="count" role="status" aria-live="polite"></span>
</header>
<div class="tools">
  <label>Size <input id="size" type="range" min="12" max="96" value="32"></label>
  <label>Colour <input id="c1" type="color" value="#1f1d1d" aria-label="Primary colour"></label>
  <label>Secondary <input id="c2" type="color" value="#4f46e5" aria-label="Secondary colour"> <input id="c3" type="color" value="#ef4444" aria-label="Third colour"></label>
  <label>Stroke <input id="sw" type="range" min="0.5" max="4" step="0.25" value="2"> <span id="swv">2px</span> <span class="count" id="swp"></span></label>
  <label>Theme <select id="theme"><option value="light">Light</option><option value="dark">Dark</option></select></label>
  <button id="reset" type="button">Reset</button>
  <span>Generated ${escapeHtml(b.generatedAt)} · grid ${b.grid.width}×${b.grid.height}</span>
</div>
<main><div id="grid"></div><p class="empty" id="empty" hidden>No icons match your search.</p></main>
<aside id="drawer" aria-hidden="true" aria-label="Icon details"></aside>
<div class="toast" id="toast" role="status">Copied</div>
<script type="application/json" id="data">${json}</script>
<script type="application/json" id="stroke">${JSON.stringify({ policy: policyOf(b), table: strokeSteps(b) })}</script>
<script>${JS.replace(/__NS__/g, n)}</script>
</body>
</html>
`
}
