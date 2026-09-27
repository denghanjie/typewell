'use strict';
const $ = id => document.getElementById(id);
const fingerNames = {lp:'Left pinky',lr:'Left ring',lm:'Left middle',li:'Left index',ri:'Right index',rm:'Right middle',rr:'Right ring',rp:'Right pinky',thumb:'Either thumb'};
const groups = {lp:'`1qaz',lr:'2wsx',lm:'3edc',li:'45rtfgvb',ri:'67yuhjnm',rm:'8ik,',rr:'9ol.',rp:"0-=p[]\\;' /".replace(' ','')};
const shiftBase = Object.fromEntries([... '~!@#$%^&*()_+{}|:"<>?'].map((c,i)=>[c,'`1234567890-=[]\\;\',./'[i]]));
function baseKey(c){return shiftBase[c] || c.toLowerCase();}
function fingerFor(c){if(c===' ')return 'thumb';if(c==='\n')return 'rp';return Object.keys(groups).find(k=>groups[k].includes(baseKey(c))) || 'rp';}
let track='Foundations',lessonIndex=0,target='',typed='',attempts=0,correctAttempts=0,elapsed=0,runningSince=null,started=false,finished=false,custom=false,history=[];
try {const saved=JSON.parse(localStorage.getItem('typewell-history')||'[]');if(Array.isArray(saved))history=saved.filter(r=>r&&typeof r.title==='string'&&Number.isFinite(r.wpm)&&Number.isFinite(r.accuracy)&&typeof r.date==='string').slice(0,50);} catch(e){$('storage-status').textContent='US QWERTY · Storage unavailable; progress lasts for this session';}
const rows=[
 [['`','~'],['1','!'],['2','@'],['3','#'],['4','$'],['5','%'],['6','^'],['7','&'],['8','*'],['9','('],['0',')'],['-','_'],['=','+'],['Backspace','',1.8]],
 [['Tab','',1.4],...['q','w','e','r','t','y','u','i','o','p'].map(k=>[k]),['[','{'],[']','}'],['\\','|',1.4]],
 [['Caps','',1.7],...['a','s','d','f','g','h','j','k','l'].map(k=>[k]),[';',':'],["'",'"'],['Enter','',1.8]],
 [['ShiftLeft','',2.2],...['z','x','c','v','b','n','m'].map(k=>[k]),[',','<'],['.','>'],['/','?'],['ShiftRight','',2.2]],
 [['Ctrl','',1.2],['Alt','',1.2],[' ','',7],['Alt','',1.2],['Ctrl','',1.2]]
];
for(const row of rows){const el=document.createElement('div');el.className='key-row';for(const [key,shift,width]of row){const k=document.createElement('div');k.className='key'+(['f','j'].includes(key)?' home':'');k.dataset.key=key;k.style.flex=width||1;if(key.length===1)k.dataset.finger=fingerFor(key);else if(key==='Enter'||key==='Backspace'||key==='ShiftRight')k.dataset.finger='rp';else if(key==='ShiftLeft'||key==='Tab')k.dataset.finger='lp';if(shift){const s=document.createElement('small');s.textContent=shift;k.append(s);}const label=document.createElement('span');label.textContent=key===' '?'Space':key.startsWith('Shift')?'Shift':key.length===1?key.toUpperCase():key;k.append(label);el.append(k);}$('keyboard').append(el);}
for(const [name,fingers] of [['Left hand',['lp','lr','lm','li','thumb']],['Right hand',['thumb','ri','rm','rr','rp']]]){const hand=document.createElement('div');hand.className='hand';const label=document.createElement('span');label.textContent=name;hand.append(label);const digits=document.createElement('div');digits.className='digits';for(const f of fingers){const digit=document.createElement('div');digit.className='finger '+f;digit.dataset.finger=f;digit.title=fingerNames[f];const text=document.createElement('b');text.textContent=({lp:'A',lr:'S',lm:'D',li:'F',ri:'J',rm:'K',rr:'L',rp:';',thumb:'␣'})[f];digit.append(text);digits.append(digit);}hand.append(digits);const caption=document.createElement('small');caption.textContent=name==='Left hand'?'Pinky → index → thumb':'Thumb → index → pinky';hand.append(caption);$('hands').append(hand);}
for(const name of Object.keys(LESSONS)){const button=document.createElement('button');button.textContent=name;button.setAttribute('aria-pressed',name===track);button.onclick=()=>{checkpoint();track=name;lessonIndex=0;custom=false;$('lesson-kind').value='All';$('lesson-search').value='';loadLessons();};document.querySelector('.tracks').append(button);}
let visibleLessons = [];
function loadLessons() {
    document.querySelectorAll('.tracks button').forEach(b => b.setAttribute('aria-pressed', b.textContent === track));
    $('lesson-kind').disabled = track === 'Foundations';
    const kind = $('lesson-kind').value;
    const query = $('lesson-search').value.trim().toLowerCase();
    visibleLessons = LESSONS[track].map((lesson, index) => ({lesson, index})).filter(({lesson}) =>
        (kind === 'All' || lesson[2].kind === kind) &&
        (lesson[0] + ' ' + lesson[2].source).toLowerCase().includes(query)
    ).map(({index}) => index);
    $('lesson').replaceChildren();
    const groups = new Map();
    for (const i of visibleLessons) {
        const [title, , meta] = LESSONS[track][i];
        if (!groups.has(meta.kind)) {
            const group = document.createElement('optgroup');
            group.label = meta.kind;
            groups.set(meta.kind, group);
            $('lesson').append(group);
        }
        groups.get(meta.kind).append(new Option(title, i));
    }
    // Navigation follows the grouped order actually shown in the selector.
    visibleLessons = [...$('lesson').options].map(option => Number(option.value));
    $('lesson-count').textContent = visibleLessons.length + ' of ' + LESSONS[track].length + ' lessons';
    $('lesson').disabled = visibleLessons.length === 0;
    if (!visibleLessons.length) {
        pause(); started = false; custom = false;
        $('typing-wrap').hidden = true; $('start').hidden = true; $('result').hidden = true;
        renderedTarget = null;
        $('exercise').textContent = 'No matching lessons. Try another topic or practice type.';
        $('feedback').textContent = ''; $('lesson-info').hidden = true;
        $('keyboard').hidden = true; $('next-key').textContent = 'Change the filters to find a lesson.';
        return;
    }
    if (!visibleLessons.includes(lessonIndex)) lessonIndex = visibleLessons[0];
    custom = false;
    $('lesson').value = lessonIndex;
    $('lesson-info').hidden = false;
    $('keyboard').hidden = !$('show-guide').checked;
    reset();
}
function updateLessonInfo() {
    const meta = custom ? {source:'Your own material', provenance:'Custom text', note:'Text supplied by you; stored only for this session.'} : LESSONS[track][lessonIndex][2];
    $('lesson-info').hidden = false;
    $('lesson-length').textContent = target.trim().split(/\s+/).length + ' words · ' + target.length + ' characters';
    $('lesson-source').textContent = meta.source + ' — ' + meta.provenance;
    $('lesson-note').textContent = meta.note;
    $('source-link').hidden = !meta.sourceUrl;
    if (meta.sourceUrl) $('source-link').href = meta.sourceUrl;
    else $('source-link').removeAttribute('href');
}
$('lesson-kind').onchange = () => {checkpoint();loadLessons();};
$('lesson-search').addEventListener('input', () => {checkpoint();loadLessons();});
function duration(){return elapsed+(runningSince===null?0:performance.now()-runningSince);}
function pause(){if(runningSince!==null){elapsed+=performance.now()-runningSince;runningSince=null;}updateMetrics();}
function scores(){let correct=0;for(let i=0;i<typed.length;i++)if(typed[i]===target[i])correct++;return {wpm:duration()>0?Math.round(correct/5/(Math.max(duration(),1000)/60000)):0,accuracy:attempts?Math.round(correctAttempts/attempts*100):100};}
function updateMetrics(){const s=scores(),seconds=Math.floor(duration()/1000);$('wpm').textContent=s.wpm;$('accuracy').textContent=s.accuracy+'%';$('time').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
function reset(){if(!custom&&!visibleLessons.length)return;pause();target=custom?target:LESSONS[track][lessonIndex][1];typed='';attempts=0;correctAttempts=0;elapsed=0;runningSince=null;started=false;finished=false;$('input').value='';$('input').disabled=false;$('typing-wrap').hidden=true;$('result').hidden=true;$('start').textContent='Start practice';$('start').hidden=false;$('feedback').textContent='Start with your index fingers on F and J.';$('feedback').className='feedback';$('tip-text').textContent=track==='AP CSA'?'Use the opposite Shift for symbols. Tab types four spaces; Enter starts a new line.':'Keep your eyes on the screen and return to the home row.';updateLessonInfo();render();$('exercise').scrollTop=0;updateMetrics();}
let renderedTarget = null, renderedTyped = '', characterNodes = [];
function render(){
  if (renderedTarget !== target) {
    const frag = document.createDocumentFragment();
    characterNodes = [...target].map(c => { const span = document.createElement('span'); span.textContent = c === '\n' ? '↵\n' : c; frag.append(span); return span; });
    $('exercise').replaceChildren(frag); renderedTarget = target; renderedTyped = '';
  }
  let first = 0;
  while(first < renderedTyped.length && first < typed.length && renderedTyped[first] === typed[first]) first++;
  for(let i=first;i<=Math.max(renderedTyped.length,typed.length) && i<target.length;i++) {
    characterNodes[i].className = i < typed.length ? (typed[i] === target[i] ? 'correct' : 'wrong') : i === typed.length ? 'current' : '';
    characterNodes[i].textContent = target[i] === '\n' ? '↵\n' : target[i] === ' ' && i === typed.length ? '·' : target[i];
  }
  renderedTyped = typed;
  $('exercise').classList.toggle('long',target.length>75);$('progress-fill').style.width=Math.min(100,typed.length/target.length*100)+'%';if(started){const current=$('exercise').querySelector('.current');if(current){const top=current.offsetTop;$('exercise').scrollTop=Math.max(0,top-90);}}const c=target[typed.length];document.querySelectorAll('.key.active,.finger.active').forEach(el=>el.classList.remove('active'));if(c!==undefined){const f=fingerFor(c);const shifted=(/[A-Z]/.test(c)||Object.hasOwn(shiftBase,c));const shiftKey=f.startsWith('l')?'ShiftRight':'ShiftLeft';document.querySelectorAll('.key').forEach(k=>{if(k.dataset.key===(c==='\n'?'Enter':baseKey(c))||(shifted&&k.dataset.key===shiftKey))k.classList.add('active');});document.querySelectorAll('.finger').forEach(d=>{if(d.dataset.finger===f||(shifted&&d.dataset.finger===(f.startsWith('l')?'rp':'lp')))d.classList.add('active');});$('next-key').textContent='Next: '+(c===' '?'Space':c==='\n'?'Enter':c.toUpperCase())+' · '+fingerNames[f]+(shifted?' + '+(f.startsWith('l')?'right':'left')+' Shift':'');}else $('next-key').textContent='All done. Relax your hands.';}
function start(){if(finished){if(custom)reset();else{lessonIndex=visibleLessons[(visibleLessons.indexOf(lessonIndex)+1)%visibleLessons.length];$('lesson').value=lessonIndex;reset();}}started=true;$('typing-wrap').hidden=false;$('start').hidden=true;$('feedback').textContent='Type the text above. Backspace to correct a mistake.';$('input').focus();}
function acceptInput(next){if(!started||finished)return;if(runningSince===null)runningSince=performance.now();let common=0;while(common<typed.length&&common<next.length&&typed[common]===next[common])common++;for(let i=common;i<next.length;i++){attempts++;if(next[i]===target[i])correctAttempts++;}typed=next.slice(0,target.length);$('input').value=typed;const wrong=[...typed].some((c,i)=>c!==target[i]);$('feedback').className='feedback'+(wrong?' error':'');$('feedback').textContent=wrong?'Check the red characters. Use Backspace to correct them.':'Keep a light touch. Return your fingers to the home row.';render();updateMetrics();if(typed===target)complete();else scheduleCheckpoint();}
function complete(){pause();finished=true;$('input').disabled=true;$('start').hidden=false;$('start').textContent=custom?'Practice again':lessonIndex===visibleLessons[visibleLessons.length-1]?'Back to first match':'Next lesson';const s=scores();$('result').hidden=false;$('result').textContent='Lesson complete — '+s.wpm+' WPM · '+s.accuracy+'% accuracy. '+(s.accuracy>=95?'Nice control. Keep the same relaxed technique.':'Try this lesson again and aim for 95% accuracy before increasing speed.');$('feedback').textContent='Well done. Take a breath before the next lesson.';const record={id:crypto.randomUUID(),lessonId:custom?'custom':LESSONS[track][lessonIndex][2].id,title:custom?'Your own material':LESSONS[track][lessonIndex][0],track:custom?'Custom':track,...s,durationMs:Math.round(duration()),characters:target.length,date:new Date().toISOString()};
clearTimeout(checkpointTimer);
if(!Account.saveResult(record)){history.unshift(record);history=history.slice(0,50);try{localStorage.setItem('typewell-history',JSON.stringify(history));}catch(e){$('storage-status').textContent='US QWERTY · Storage unavailable; progress lasts for this session';}}renderHistory();}
function renderHistory(){$('record-count').textContent='('+history.length+')';$('history').replaceChildren();if(!history.length){$('history').textContent='Complete a lesson to see your results here.';return;}history.slice(0,10).forEach(r=>{const row=document.createElement('div');row.className='history-row';row.textContent=r.title;const detail=document.createElement('span');detail.textContent=r.wpm+' WPM · '+r.accuracy+'% accuracy · '+new Date(r.date).toLocaleDateString();row.append(detail);$('history').append(row);});}
$('input').addEventListener('input',e=>acceptInput(e.target.value));
$('input').addEventListener('paste',e=>{e.preventDefault();$('feedback').textContent='Type each key for practice. To import a passage, use “Practice your own material”.';});
$('input').addEventListener('drop',e=>e.preventDefault());
$('input').addEventListener('beforeinput',e=>{if(e.inputType==='insertFromPaste'||e.inputType==='insertFromDrop')e.preventDefault();});
$('input').addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey&&track==='AP CSA'){e.preventDefault();const input=$('input');input.setRangeText('    ',input.selectionStart,input.selectionEnd,'end');acceptInput(input.value);}if(e.key==='Escape'){pause();$('input').blur();}});
$('input').addEventListener('blur',()=>{pause();checkpoint();if(started&&!finished)$('feedback').textContent='Paused. Click the typing box to continue.';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();checkpoint();}});
$('start').onclick=start;$('restart').onclick=()=>{clearTimeout(checkpointTimer);if(!custom)Account.saveDraft({clear:true,lessonId:LESSONS[track][lessonIndex][2].id});reset();};$('lesson').onchange=()=>{if($('lesson').value==='custom')return;checkpoint();custom=false;lessonIndex=Number($('lesson').value);$('lesson').querySelector('[value=custom]')?.remove();reset();};
$('show-guide').onchange=()=>{$('keyboard').hidden=!$('show-guide').checked;$('hands').hidden=!$('show-guide').checked;};
$('use-custom').onclick=()=>{const text=$('custom-text').value.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,'-').replace(/\u00a0/g,' ').trim();if(!text){$('custom-message').textContent='Add some text first.';return;}if(/[^\x20-\x7e\n]/.test(text)){$('custom-message').textContent='Please use English letters, numbers and US keyboard punctuation.';return;}if(text.length>20000){$('custom-message').textContent='Please keep the passage under 20,000 characters.';return;}checkpoint();custom=true;target=text;$('lesson').disabled=false;$('keyboard').hidden=!$('show-guide').checked;$('lesson').querySelector('[value=custom]')?.remove();$('lesson').append(new Option('Your own material','custom'));$('lesson').value='custom';reset();$('custom-message').textContent='Your text is ready in the practice panel.';$('start').scrollIntoView({behavior:'smooth',block:'center'});};
let checkpointTimer;
function scheduleCheckpoint(){clearTimeout(checkpointTimer);checkpointTimer=setTimeout(checkpoint,1000);}
function checkpoint(){
  clearTimeout(checkpointTimer);
  if(custom || !started || finished || !typed.length || !Account.signedIn())return;
  let position=0;while(position<typed.length && typed[position]===target[position])position++;
  Account.saveDraft({lessonId:LESSONS[track][lessonIndex][2].id,position,durationMs:Math.round(duration()),attempts,correctAttempts});
}
window.Typewell = {
  checkpoint,
  guestResults:()=>history,
  resetForAccount:()=>{clearTimeout(checkpointTimer);reset();},
  resume:draft=>{
    checkpoint();
    for(const [name,rows] of Object.entries(LESSONS)){
      const index=rows.findIndex(l=>l[2].id===draft.lessonId);
      if(index<0)continue;
      track=name;lessonIndex=index;custom=false;$('lesson-kind').value='All';$('lesson-search').value='';loadLessons();
      typed=target.slice(0,Math.min(draft.position,target.length));elapsed=draft.durationMs;attempts=draft.attempts;correctAttempts=draft.correctAttempts;
      $('input').value=typed;started=true;$('typing-wrap').hidden=false;$('start').hidden=true;
      render();updateMetrics();$('feedback').textContent='Checkpoint restored. Click the typing box to continue.';
      $('typing-wrap').scrollIntoView({behavior:'smooth',block:'center'});return;
    }
  }
};
setInterval(()=>{if(runningSince!==null)updateMetrics();},250);loadLessons();renderHistory();

Account.init();
