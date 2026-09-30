'use strict';
// Account state and retry queues are isolated by the server's immutable user ID.
const Account = (() => {
  const el = id => document.getElementById(id);
  let user = null, progress = null, generation = 0, flushing = false, mode = 'login';
  let memoryQueues = {}, chain = Promise.resolve();
  const status = text => { el('sync-status').textContent = text; };
  const key = uid => 'typewell-pending-' + uid;
  function queue(uid) {
    if (memoryQueues[uid]) return memoryQueues[uid];
    try { const q = JSON.parse(localStorage.getItem(key(uid)) || '[]'); return memoryQueues[uid] = Array.isArray(q) ? q : []; }
    catch { return memoryQueues[uid] = []; }
  }
  function persist(uid) {
    try { localStorage.setItem(key(uid), JSON.stringify(queue(uid))); return true; }
    catch { status('Browser storage unavailable. Keep this page open until your results sync.'); return false; }
  }
  async function api(path, data, uid = user?.id, signal) {
    const response = await fetch('/api/' + path, {
      method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json', 'X-Typewell-Request': '1', 'X-Typewell-User': String(uid || '') },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    let value;
    try { value = await response.json(); } catch { throw new Error('Account service unavailable. Guest practice is still available.'); }
    if (!response.ok) throw new Error(value.error || 'Unable to sync. Please try again.');
    return value;
  }
  function draw() {
    el('account-name').textContent = user ? user.username : 'Guest practice';
    el('sign-in').hidden = !!user; el('sign-out').hidden = !user;
    el('account-progress').hidden = !user;
    el('storage-status').textContent = user ? 'US QWERTY · Signed-in progress syncs across devices' : 'US QWERTY · Guest results stay on this device';
    el('import-guest').hidden = !user || !window.Typewell?.guestResults().length;
    if (!user || !progress) return;
    const s = progress.summary;
    el('account-stats').textContent = `${s.sessions} completed session${s.sessions === 1 ? '' : 's'} · ${(s.durationMs / 60000).toFixed(1)} practice minutes · ${Math.round(s.bestWpm)} best WPM · ${Math.round(s.avgAccuracy)}% average accuracy`;
    el('track-progress').replaceChildren();
    for (const [track, lessons] of Object.entries(LESSONS)) {
      const n = lessons.filter(l => progress.completed.includes(l[2].id)).length;
      const item = document.createElement('span'); item.textContent = `${track}: ${n} / ${lessons.length} lessons`; el('track-progress').append(item);
    }
    const draft = progress.draft;
    const lesson = draft && Object.values(LESSONS).flat().find(l => l[2].id === draft.lessonId);
    el('resume-practice').hidden = !lesson;
    if (lesson) el('resume-practice').textContent = `Resume ${lesson[0]} (${Math.round(draft.position / lesson[1].length * 100)}%)`;
    el('account-history').replaceChildren();
    for (const r of progress.results.slice(0,10)) {
      const row = document.createElement('p'); row.className = 'history-row';
      row.textContent = `${r.track} · ${r.title} — ${r.wpm} WPM · ${r.accuracy}% · ${new Date(r.date).toLocaleDateString()}`;
      el('account-history').append(row);
    }
  }
  async function refresh() {
    if (!user) return;
    const uid = user.id, epoch = generation;
    const value = await api('progress', undefined, uid);
    if (generation !== epoch) return;
    progress = value; draw();
  }
  async function flush() {
    if (!user || flushing) return;
    flushing = true; const uid = user.id, epoch = generation;
    try {
      while (queue(uid).length && generation === epoch) {
        const r = queue(uid)[0]; await api('results', r, uid);
        memoryQueues[uid] = queue(uid).filter(item => item.id !== r.id); persist(uid);
      }
      if (generation === epoch) { await refresh(); status('Progress synced to your account.'); }
    } catch (e) { if (generation === epoch) status(`${e.message} ${queue(uid).length} result(s) waiting on this device. Use Sync to retry.`); }
    finally { flushing = false; }
  }
  function saveResult(result) {
    if (!user) return false;
    queue(user.id).push(result); persist(user.id); status('Saving your result…');
    // Serialize after pending checkpoint writes, so completion removes the checkpoint last.
    chain = chain.then(flush, flush); return true;
  }
  function saveDraft(draft) {
    if (!user) return;
    const uid = user.id, epoch = generation;
    chain = chain.then(async () => {
      if (epoch !== generation) return;
      try { await api('draft', draft, uid); if (epoch === generation) { if (progress) progress.draft = draft.clear ? null : draft; draw(); status('Checkpoint saved. You can resume on another device.'); } }
      catch (e) { if (epoch === generation) status('Checkpoint not synced. ' + e.message); }
    });
  }
  function setUser(next) {
    generation++; user = next; progress = null;
    window.Typewell?.resetForAccount(); draw();
    window.dispatchEvent(new Event('typewell-account'));
    if (user) { status('Loading progress…'); chain = chain.then(flush, flush); }
    else status('Sign in to save your progress across devices.');
  }
  function setMode(next) {
    mode = next; el('auth-form').reset(); el('auth-error').textContent = '';
    el('auth-title').textContent = ({login:'Welcome back',register:'Create your student account',recover:'Recover your account'})[mode];
    el('auth-submit').textContent = ({login:'Sign in',register:'Create account',recover:'Reset password'})[mode];
    el('recovery-field').hidden = mode !== 'recover';
    el('recovery-input').required = mode === 'recover';
    el('auth-password').minLength = mode === 'login' ? 1 : 10;
    el('auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    el('password-label').textContent = mode === 'recover' ? 'New password (at least 10 characters)' : 'Password' + (mode === 'register' ? ' (at least 10 characters)' : '');
  }
  el('sign-in').onclick = () => { setMode('login'); el('auth-content').hidden = false; el('recovery-saved').hidden = true; el('auth-dialog').showModal(); };
  document.querySelectorAll('[data-auth-mode]').forEach(b => b.onclick = () => setMode(b.dataset.authMode));
  el('auth-close').onclick = () => el('auth-dialog').close();
  el('recovery-done').onclick = () => el('auth-dialog').close();
  el('auth-dialog').addEventListener('close', () => { el('auth-form').reset(); el('recovery-code').textContent = ''; });
  el('auth-form').onsubmit = async event => {
    event.preventDefault(); el('auth-submit').disabled = true; el('auth-error').textContent = '';
    try {
      const value = await api(mode, {username:el('auth-username').value.trim(), password:el('auth-password').value, recoveryCode:el('recovery-input').value.trim()});
      setUser(value.user); el('auth-form').reset();
      if (value.recoveryCode) { el('auth-content').hidden = true; el('recovery-saved').hidden = false; el('recovery-code').textContent = value.recoveryCode; el('recovery-done').focus(); }
      else el('auth-dialog').close();
    } catch (e) { el('auth-error').textContent = e.message; }
    finally { el('auth-submit').disabled = false; }
  };
  el('sign-out').onclick = async () => {
    el('sign-out').disabled = true;
    try { await window.Race?.leave(); window.Typewell?.checkpoint(); await chain; await api('logout', {}); setUser(null); }
    catch (e) { status(e.message); }
    finally { el('sign-out').disabled = false; }
  };
  el('sync-now').onclick = () => { window.Typewell?.checkpoint(); chain = chain.then(flush, flush); };
  el('resume-practice').onclick = () => { if (progress?.draft) window.Typewell?.resume(progress.draft); };
  el('import-guest').onclick = async () => {
    if (!user) return;
    const uid = user.id, epoch = generation; el('import-guest').disabled = true;
    try {
      const results = await Promise.all(window.Typewell.guestResults().map(async r => ({id:r.id || 'guest-' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([r.title,r.date,r.wpm,r.accuracy]))))].map(b=>b.toString(16).padStart(2,'0')).join(''), lessonId:r.lessonId || 'imported', title:r.title.slice(0,250), track:r.track || 'Imported', wpm:r.wpm, accuracy:r.accuracy, durationMs:r.durationMs || 0, characters:r.characters || 0, date:r.date})));
      await api('import', {results}, uid);
      if (epoch === generation) { await refresh(); status('Guest results imported. Re-importing will not duplicate them.'); }
    } catch(e) { if (epoch === generation) status(e.message); }
    finally { el('import-guest').disabled = false; }
  };
  window.addEventListener('online', () => { chain = chain.then(flush, flush); });
  async function init() {
    try { const result = await api('me'); setUser(result.user); }
    catch(e) { status(e.message); }
  }
  return {init, saveResult, saveDraft, refresh, request:api, currentUser:()=>user, signedIn:() => !!user};
})();
