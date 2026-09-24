/**
 * BloomAI — Data Layer (localStorage)
 * 
 * All data lives in localStorage under prefixed keys.
 * This works for GitHub Pages (no server required).
 *
 * Keys:
 *   bloom_users       → array of user objects
 *   bloom_sessions    → array of session/result objects (all public)
 */

const DB = (() => {

  // ── Users ────────────────────────────────────────────────────────────
  function getUsers() {
    try { return JSON.parse(localStorage.getItem('bloom_users') || '[]'); }
    catch { return []; }
  }

  function addUser(user) {
    const users = getUsers();
    users.push(user);
    localStorage.setItem('bloom_users', JSON.stringify(users));
  }

  function getUser(username) {
    return getUsers().find(u => u.username === username) || null;
  }

  // Lê o usuário, aplica fn(user) e grava de volta. Sempre relê do
  // localStorage antes de gravar, para não sobrescrever mudanças feitas
  // em outra aba (ex.: compra em Espólios enquanto a Arena está aberta).
  function updateUser(username, fn) {
    const users = getUsers();
    const u = users.find(x => x.username === username);
    if (!u) return null;
    fn(u);
    localStorage.setItem('bloom_users', JSON.stringify(users));
    // Mantém a cópia da sessão ativa sincronizada
    try {
      const sess = JSON.parse(localStorage.getItem('bloom_session') || 'null');
      if (sess && sess.username === username) {
        sess.blooms = u.blooms || 0;
        sess.xp = u.xp || 0;
        localStorage.setItem('bloom_session', JSON.stringify(sess));
      }
    } catch {}
    return u;
  }

  // ── Sessions (answers) ───────────────────────────────────────────────
  // Each session record:
  // {
  //   id: string,
  //   username: string,
  //   name: string,
  //   topic: string,
  //   startedAt: number,
  //   endedAt: number,
  //   attempts: [ { level: 0-5, bloomLevel: string, correct: bool, ts: number } ],
  //   finalBloomLevel: string,
  //   bkt: number (0-1),
  // }

  function getSessions() {
    try { return JSON.parse(localStorage.getItem('bloom_sessions') || '[]'); }
    catch { return []; }
  }

  function saveSession(session) {
    const sessions = getSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) sessions[idx] = session;
    else sessions.push(session);
    localStorage.setItem('bloom_sessions', JSON.stringify(sessions));
  }

  function newSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  // ── Analytics helpers ────────────────────────────────────────────────
  function getTopics() {
    const sessions = getSessions();
    const topicSet = new Set(sessions.map(s => s.topic?.toLowerCase()).filter(Boolean));
    return [...topicSet].sort();
  }

  function getSessionsByTopic(topic) {
    if (!topic) return getSessions();
    const t = topic.toLowerCase();
    return getSessions().filter(s => s.topic?.toLowerCase().includes(t));
  }

  // Aggregate per-level accuracy across sessions
  function getLevelStats(sessions) {
    const levels = ['Lembrar','Entender','Aplicar','Analisar','Avaliar','Criar'];
    const stats = {};
    levels.forEach(l => { stats[l] = { correct: 0, wrong: 0 }; });
    sessions.forEach(s => {
      (s.attempts || []).forEach(a => {
        if (stats[a.bloomLevel]) {
          if (a.correct) stats[a.bloomLevel].correct++;
          else stats[a.bloomLevel].wrong++;
        }
      });
    });
    return stats;
  }

  return { getUsers, getUser, updateUser, addUser, getSessions, saveSession, newSessionId, getTopics, getSessionsByTopic, getLevelStats };
})();

// Guard: redirect to login if no session (except on index and analytics pages)
(function checkSession() {
  const page = window.location.pathname.split('/').pop();
  if (page === 'app.html' || page === 'espolios.html') {
    const sess = localStorage.getItem('bloom_session');
    if (!sess) window.location.href = 'index.html';
  }
})();
