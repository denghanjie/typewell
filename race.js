'use strict';
// One in-flight request per tab. Server revisions protect reconnects and competing tabs.
window.Race = (() => {
  const el = id => document.getElementById(id);
  let room=null, uid=null, epoch=0, pending=false, timer=null, active=false;
  let typed='', attempts=0, correct=0, dirty=false, revision=0, nodes=[], oldTyped='';
  let anchor=0, serverTime=0, savedResult=false;
  const terminal = r => r && !['waiting','running'].includes(r.state);
  const now = () => serverTime + performance.now()-anchor;
  const me = () => room?.players.find(p=>p.id===uid);
  const say = text => {if(el('race-status').textContent!==text)el('race-status').textContent=text;};
  const request = (action,data={}) => Account.request('race/'+action,data,uid,AbortSignal.timeout(10000));
  function controls() {
    el('race-setup').hidden=!!room;
    el('race-room').hidden=!room;
    const guest=!Account.signedIn();
    for(const id of ['race-create','race-join','race-reconnect']) el(id).disabled=guest || pending;
    el('race-signin').hidden=!guest;
    el('race-leave').disabled=pending;
    el('race-ready').disabled=pending || !!me()?.ready || room?.players.length!==2;
    el('race-ready').hidden=!room || room.state!=='waiting';
    el('solo-area').hidden=!!room;
    el('resume-practice').disabled=!!room;
  }
  function clear() {
    epoch++; clearTimeout(timer); room=null; active=false; typed=''; dirty=false; nodes=[];
    pending=false; savedResult=false; controls();
  }
  function renderText() {
    let first=0;
    while(first<oldTyped.length && first<typed.length && oldTyped[first]===typed[first])first++;
    for(let i=first;i<=Math.max(oldTyped.length,typed.length) && i<nodes.length;i++){
      const c=room.lesson.text[i];
      nodes[i].className=i<typed.length?(typed[i]===c?'correct':'wrong'):i===typed.length?'current':'';
      nodes[i].textContent=c==='\n'?'↵\n':c===' ' && i===typed.length?'·':c;
    }
    oldTyped=typed;
    const current=nodes[typed.length];
    if(current && active)el('race-text').scrollTop=Math.max(0,current.offsetTop-75);
    const c=room.lesson.text[typed.length];
    el('race-key').textContent=c===undefined?'All characters entered. Correct any red characters to finish.':Typewell.keyHint(c);
  }
  function restore(p) {
    typed=room.lesson.text.slice(0,p.position);attempts=p.attempts;correct=p.correctAttempts;revision=p.revision;dirty=false;
    el('race-input').value=typed;renderText();
  }
  function setupRoom(value) {
    Typewell.checkpoint();
    room=value;active=false;savedResult=false;oldTyped='';
    const frag=document.createDocumentFragment();
    nodes=[...room.lesson.text].map(c=>{const span=document.createElement('span');span.textContent=c==='\n'?'↵\n':c;frag.append(span);return span;});
    el('race-text').replaceChildren(frag);el('race-text').scrollTop=0;
    el('race-code').textContent=room.code;
    el('race-lesson-name').textContent=room.lesson.track+' · '+room.lesson.title+' · '+room.lesson.text.length+' characters';
    const meta=Object.values(LESSONS).flat().find(l=>l[2].id===room.lesson.id)?.[2];
    el('race-source').textContent=meta?meta.source+' — '+meta.provenance+'. '+meta.note:'Built-in Typewell lesson.';
    restore(me());controls();
  }
  function acceptRoom(value) {
    const fresh=!room || room.code!==value.code;
    if(fresh)setupRoom(value); else room=value;
    serverTime=value.serverNow;anchor=performance.now();
    revision=me().revision;
    if(value.conflict){restore(me());say('Another tab updated this race. Your saved position was restored.');}
    if(me().finishedAt && !savedResult){
      savedResult=true;dirty=false;
      Account.refresh().catch(()=>{});
    }
    draw();tick();controls();
  }
  function draw() {
    if(!room)return;
    el('race-players').replaceChildren();
    for(const player of room.players){
      const item=document.createElement('div');item.className='race-player'+(player.id===uid?' self':'');
      const name=document.createElement('strong');name.textContent=player.username+(player.id===uid?' (you)':'');
      const line=document.createElement('p');
      const connection=now()-player.lastSeen>10000?' · connection delayed':'';
      line.textContent=room.state==='waiting'?(player.ready?'Ready':'Not ready')+connection:`${Math.floor(player.position/room.lesson.text.length*100)}% · ${player.wpm} WPM · ${player.accuracy}% accuracy${player.finishedAt?' · Finished':connection}`;
      const bar=document.createElement('progress');bar.max=room.lesson.text.length;bar.value=player.position;bar.setAttribute('aria-label',player.username+' progress');
      item.append(name,line,bar);el('race-players').append(item);
    }
    if(room.players.length===1){const p=document.createElement('p');p.textContent='Waiting for your opponent. Share the room code above.';el('race-players').append(p);}
    if(room.state==='waiting')say(room.players.length<2?'Share the room code with a friend.':'Both players must select Ready to race.');
    else if(room.winnerId){
      const winner=room.players.find(p=>p.id===room.winnerId);
      say(`${winner.username} wins! ${me().finishedAt?'Your completed race is saved to your account.':terminal(room)?room.reason:'You can still finish the passage to save your result.'}`);
    } else if(terminal(room))say(room.reason || 'Race finished.');
    else if(me().finishedAt)say('Finished! Waiting for your opponent. Your result is saved.');
    else if(now()>=room.startsAt)say('Go! Correct every mistake and complete the passage.');
    el('race-outcome').hidden=!room.winnerId && !terminal(room);
    el('race-outcome').textContent=el('race-status').textContent;
    if(me().finishedAt)el('race-key').textContent='Passage complete. Relax your hands.';
  }
  function tick() {
    if(!room)return;
    const p=me();
    const remaining=room.startsAt ? Math.max(0,Math.ceil((room.startsAt-now())/1000)) : 0;
    const canType=room.state==='running' && remaining===0 && now()<room.expiresAt && !p.finishedAt;
    el('race-input').disabled=!canType || typed===room.lesson.text;
    if(room.state==='waiting')el('race-clock').textContent='Waiting for two ready players';
    else if(remaining && room.state==='running')el('race-clock').textContent='Starts in '+remaining+'…';
    else if(terminal(room) && !p.finishedAt)el('race-clock').textContent='Race ended';
    else if(room.startsAt){
      const seconds=Math.floor(Math.max(0,(p.finishedAt || Math.min(now(),room.expiresAt))-room.startsAt)/1000);
      el('race-clock').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' elapsed';
    }else el('race-clock').textContent='Room closed';
    if(canType && !active){active=true;el('race-input').focus();say('Go! Correct every mistake and complete the passage.');}
  }
  function snapshot() {
    let position=0;while(position<typed.length && typed[position]===room.lesson.text[position])position++;
    return {revision,position,attempts,correctAttempts:correct,...(typed===room.lesson.text?{text:typed}:{})};
  }
  async function sync() {
    clearTimeout(timer);
    if(!room || pending || terminal(room))return;
    pending=true;const token=epoch;const sent=dirty?snapshot():null;
    try {
      const result=await request('sync',{code:room.code,...(sent?{progress:sent}:{})});
      if(token!==epoch)return;
      if(sent && result.room.players.find(p=>p.id===uid).revision>sent.revision && attempts===sent.attempts && typed.slice(0,sent.position)===room.lesson.text.slice(0,sent.position) && snapshot().position===sent.position)dirty=false;
      acceptRoom(result.room);
    }catch(e){if(token===epoch)say('Connection interrupted. Keep this page open; retrying… '+e.message);}
    finally{
      if(token===epoch){pending=false;controls();if(room && !terminal(room))timer=setTimeout(sync,dirty && typed===room.lesson.text?50:1500);}
    }
  }
  async function action(name,data) {
    if(pending)return;
    clearTimeout(timer);pending=true;controls();const token=epoch;
    try{
      const result=await request(name,data);
      if(token!==epoch)return;
      if(result.room)acceptRoom(result.room);
      else say('No active room. Create a race or enter your friend’s code.');
    }catch(e){if(token===epoch)say(e.message);}
    finally{if(token===epoch){pending=false;controls();if(room && !terminal(room))timer=setTimeout(sync,1000);}}
  }
  async function leave() {
    if(!room){return;}
    // UI leaves are disabled during requests; sign-out waits for the same operation to settle.
    if(pending)throw new Error('Please wait a moment, then leave the race or sign out.');
    pending=true;clearTimeout(timer);controls();
    try{
      if(!terminal(room))await request('leave',{code:room.code});
      clear();say('Race room closed. You can practice solo or start a new race.');
    }catch(e){pending=false;controls();timer=setTimeout(sync,1500);throw e;}
  }
  function input(next) {
    if(!room || room.state!=='running' || now()<room.startsAt || now()>=room.expiresAt || me().finishedAt || terminal(room)){el('race-input').value=typed;return;}
    next=next.slice(0,room.lesson.text.length);
    let common=0;while(common<typed.length && common<next.length && typed[common]===next[common])common++;
    for(let i=common;i<next.length;i++){attempts++;if(next[i]===room.lesson.text[i])correct++;}
    typed=next;el('race-input').value=typed;dirty=true;renderText();
    if(typed===room.lesson.text){el('race-input').disabled=true;say('Checking your finish…');if(!pending)sync();}
  }
  function chooseTrack(){
    el('race-lesson').replaceChildren();
    for(const [title,,meta] of LESSONS[el('race-track').value])el('race-lesson').append(new Option(title,meta.id));
  }
  Object.keys(LESSONS).forEach(track=>el('race-track').append(new Option(track,track)));chooseTrack();
  el('race-track').onchange=chooseTrack;
  el('race-create').onclick=()=>action('create',{lessonId:el('race-lesson').value});
  el('race-join-form').onsubmit=event=>{event.preventDefault();action('join',{code:el('race-join-code').value.trim().toUpperCase()});};
  el('race-reconnect').onclick=()=>action('current',{});
  el('race-ready').onclick=()=>action('ready',{code:room.code});
  el('race-leave').onclick=()=>leave().catch(e=>say(e.message));
  el('race-signin').onclick=()=>el('sign-in').click();
  el('race-input').addEventListener('input',e=>input(e.target.value));
  for(const name of ['paste','drop'])el('race-input').addEventListener(name,e=>{e.preventDefault();say('Type each character yourself. Pasting is disabled in races.');});
  el('race-input').addEventListener('beforeinput',e=>{if(['insertFromPaste','insertFromDrop'].includes(e.inputType))e.preventDefault();});
  el('race-input').addEventListener('keydown',e=>{
    if(e.key==='Tab'&&!e.shiftKey&&room?.lesson.track==='AP CSA'){
      e.preventDefault();const field=el('race-input');field.setRangeText('    ',field.selectionStart,field.selectionEnd,'end');input(field.value);
    }
  });
  function identity(){clear();uid=Account.currentUser()?.id || null;controls();if(uid)action('current',{});else say('Sign in to race a friend. Each player needs their own account.');}
  window.addEventListener('typewell-account',identity);
  window.addEventListener('online',()=>{if(room&&!pending)sync();});
  setInterval(tick,200);identity();
  return {leave};
})();
