/**
 * Operamind — Área do Pesquisador
 * Login do administrador, Painel da Aula (ao vivo), Banco de Questões (gerado
 * pela própria ferramenta) e Dados do evento. Depende de config.js, api.js e bloom.js.
 */
const PQ = (() => {
  const NIVEIS_POS = ['Lembrar', 'Compreender', 'Aplicar'];
  const MODELO_PADRAO = 'nvidia/nemotron-3-ultra-550b-a55b:free';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  let sessao = null;          // { token, email, planilha }
  let dados = null;           // { participantes, respostas, config }
  let banco = null;           // { questoes, config }
  let timerPainel = null;
  let gerando = false;

  // ── Sessão ────────────────────────────────────────────────────────────
  function lerSessao() { try { return JSON.parse(sessionStorage.getItem('operamind_admin') || 'null'); } catch { return null; } }
  function gravarSessao(s) { sessao = s; sessionStorage.setItem('operamind_admin', JSON.stringify(s)); }

  async function admin(acao, extra = {}) {
    const r = await API.chamar(acao, Object.assign({ token: sessao?.token }, extra));
    if (!r.ok && r.erro === 'nao_autorizado') { sair(); throw new Error('Sessão expirada. Entre novamente.'); }
    return r;
  }

  function iniciar() {
    if (!API.configurado()) {
      $('login-msg').innerHTML = 'A planilha ainda não foi conectada. Preencha <code>API_URL</code> em <code>config.js</code> (veja <code>backend/COMO-CONFIGURAR.md</code>).';
    }
    sessao = lerSessao();
    if (sessao?.token) entrarNaArea();
    $('login-form').onsubmit = async e => {
      e.preventDefault();
      const btn = $('login-btn'); btn.disabled = true; $('login-msg').textContent = 'Verificando…';
      try {
        const r = await API.chamar('login', { email: $('login-email').value, senha: $('login-senha').value });
        if (!r.ok) {
          $('login-msg').textContent = { credenciais_invalidas: 'E-mail ou senha incorretos.', muitas_tentativas: 'Muitas tentativas. Aguarde 15 minutos.',
            admin_nao_configurado: 'Administrador ainda não definido na planilha (menu Operamind).' }[r.erro] || ('Erro: ' + r.erro);
          return;
        }
        gravarSessao({ token: r.token, email: r.email, planilha: r.planilha });
        $('login-senha').value = '';
        entrarNaArea();
      } catch (err) {
        $('login-msg').textContent = 'Não foi possível conectar à planilha. ' + err.message;
      } finally { btn.disabled = false; }
    };
  }

  function entrarNaArea() {
    $('login-overlay').hidden = true;
    $('area').hidden = false;
    $('admin-email').textContent = sessao.email;
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => abrirAba(b.dataset.tab));
    abrirAba('painel');
  }

  function sair() {
    sessionStorage.removeItem('operamind_admin');
    sessao = null; clearInterval(timerPainel);
    $('area').hidden = true; $('login-overlay').hidden = false;
  }

  function abrirAba(nome) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === nome));
    document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id !== 'tab-' + nome);
    clearInterval(timerPainel);
    if (nome === 'painel') { carregarPainel(); timerPainel = setInterval(carregarPainel, 5000); }
    if (nome === 'banco') carregarBanco();
    if (nome === 'dados') carregarDados();
    if (nome === 'geral' && window.iniciarAnaliseGeral) window.iniciarAnaliseGeral();
  }

  // ── Cálculos (desenho 2: autoavaliação → escada → autoavaliação) ──────
  const ITENS = ['Sabe o que é', 'Compreende como funciona', 'Sabe aplicar'];
  const DEGRAUS = ['Aplicar', 'Compreender', 'Lembrar', 'Revisão'];

  function analisar(d) {
    const porCodigo = {};
    d.respostas.forEach(r => { (porCodigo[r.codigo] = porCodigo[r.codigo] || []).push(r); });
    const participantes = d.participantes.map(p => {
      const rs = porCodigo[p.codigo] || [];
      const auto = fase => [1, 2, 3].map(i => { const r = rs.find(x => x.fase === fase && Number(x.posicao) === i); return r ? Number(r.acertou) === 1 : null; });
      const escada = [1, 2, 3].map(c => {
        const tent = rs.filter(r => r.fase === 'treino' && Number(r.conceito) === c).sort((a, b) => Number(a.posicao) - Number(b.posicao));
        const ok = tent.find(r => Number(r.acertou) === 1);
        if (ok) return ok.nivel;
        if (tent.some(r => Number(r.remediacao) === 1)) return 'Revisão';
        return null;
      });
      const antes = auto('auto_antes'), depois = auto('auto_depois');
      return Object.assign({}, p, { antes, depois, escada,
        simAntes: antes.filter(Boolean).length, simDepois: depois.filter(Boolean).length,
        completo: antes.every(v => v !== null) && depois.every(v => v !== null) && escada.every(v => v !== null) });
    });
    const com = f => participantes.filter(f);
    const pct = (arr, f) => arr.length ? arr.filter(f).length / arr.length * 100 : 0;
    const temAntes = com(p => p.antes.every(v => v !== null));
    const temDepois = com(p => p.depois.every(v => v !== null));
    const pares = com(p => p.completo);
    const itens = [0, 1, 2].map(i => {
      const naoAntes = com(p => p.antes[i] === false && p.escada[i] !== null);
      return {
        simAntes: pct(temAntes, p => p.antes[i]), simDepois: pct(temDepois, p => p.depois[i]),
        naoParaSim: pares.filter(p => p.antes[i] === false && p.depois[i] === true).length,
        naoAntes: pares.filter(p => p.antes[i] === false).length,
        simParaNao: pares.filter(p => p.antes[i] === true && p.depois[i] === false).length,
        escada: DEGRAUS.map(g => com(p => p.escada[i] === g).length),
        naoSabiaAcertou: naoAntes.filter(p => p.escada[i] !== 'Revisão').length, naoSabiaTotal: naoAntes.length,
        // Calibração: disse "sim" no fim e acertou de primeira (Aplicar)
        simFimAcertouAplicar: pares.filter(p => p.depois[i] === true && p.escada[i] === 'Aplicar').length,
        simFim: pares.filter(p => p.depois[i] === true).length,
      };
    });
    return { participantes, pares, cadastrados: d.participantes.length, concluidos: pares.length,
      emAndamento: participantes.length - pares.length, itens,
      mediaSimAntes: temAntes.length ? temAntes.reduce((s, p) => s + p.simAntes, 0) / temAntes.length / 3 * 100 : 0,
      mediaSimDepois: temDepois.length ? temDepois.reduce((s, p) => s + p.simDepois, 0) / temDepois.length / 3 * 100 : 0,
      revisoes: participantes.reduce((s, p) => s + p.escada.filter(g => g === 'Revisão').length, 0),
      nAntes: temAntes.length, nDepois: temDepois.length };
  }

  // ── Painel da Aula ────────────────────────────────────────────────────
  async function carregarPainel() {
    try {
      const r = await admin('dados');
      if (!r.ok) throw new Error(r.erro);
      dados = r; renderPainel();
      $('painel-status').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    } catch (e) { $('painel-status').textContent = 'Falha ao atualizar: ' + e.message; }
  }

  function renderPainel() {
    const a = analisar(dados);
    const aberto = dados.config.eventoAberto === 'sim';
    const link = new URL('evento.html', location.href).href;
    $('ev-toggle').textContent = aberto ? 'Encerrar evento' : 'Abrir evento';
    $('ev-toggle').className = 'btn-admin ' + (aberto ? 'danger' : 'primary');
    $('ev-estado').innerHTML = aberto ? '<span class="dot on"></span>Evento aberto' : '<span class="dot"></span>Evento fechado';
    $('ev-link').textContent = link; $('ev-link').href = link;
    if (!$('qr').dataset.link || $('qr').dataset.link !== link) {
      $('qr').innerHTML = ''; $('qr').dataset.link = link;
      if (window.QRCode) new QRCode($('qr'), { text: link, width: 168, height: 168, colorDark: '#000', colorLight: '#fff' });
      else $('qr').innerHTML = '<span style="font-size:12px;color:#555;text-align:center">QR indisponível — use o link</span>';
    }
    $('k-cad').textContent = a.cadastrados; $('k-fim').textContent = a.concluidos;

    const barras = (lado) => ITENS.map((n, i) => {
      const v = lado === 'antes' ? a.itens[i].simAntes : a.itens[i].simDepois;
      return `<div class="lvbar"><span>${n}</span><div class="lvtrack"><div class="lvfill" style="width:${v.toFixed(0)}%"></div></div><b>${v.toFixed(0)}%</b></div>`;
    }).join('');
    $('card-antes').innerHTML = `<div class="pp-label">Etapa 1 · Antes</div><div class="pp-big">${a.mediaSimAntes.toFixed(0)}%</div>
      <div class="pp-sub">responderam "sim" (n=${a.nAntes})</div>${barras('antes')}`;
    $('card-depois').innerHTML = `<div class="pp-label">Etapa 3 · Depois</div><div class="pp-big accent">${a.mediaSimDepois.toFixed(0)}%</div>
      <div class="pp-sub">responderam "sim" (n=${a.nDepois})</div>${barras('depois')}`;

    const cores = ['#5fe3a1', '#0088cc', '#ffb380', '#ff8fa3'];
    $('pp-escada').innerHTML = `<div class="pp-label" style="margin-bottom:14px">Etapa 2 · Operamind em ação: em que degrau cada pessoa acertou</div>
      <div class="esc-grid">${ITENS.map((n, i) => {
        const it = a.itens[i], tot = it.escada.reduce((x, y) => x + y, 0) || 1;
        return `<div class="esc-col"><div class="esc-title">Desafio ${i + 1} · ${n.replace('Sabe ', '').replace('Compreende ', '')}</div>
          <div class="esc-bar">${it.escada.map((v, k) => v ? `<div style="width:${v / tot * 100}%;background:${cores[k]}" title="${DEGRAUS[k]}: ${v}">${v}</div>` : '').join('')}</div>
          <div class="esc-note">${it.naoSabiaTotal ? `Dos <b>${it.naoSabiaTotal}</b> que disseram "não" antes, <b>${it.naoSabiaAcertou}</b> acertaram sem precisar da revisão` : '&nbsp;'}</div></div>`;
      }).join('')}</div>
      <div class="esc-legend">${DEGRAUS.map((g, k) => `<span><i style="background:${cores[k]}"></i>${g === 'Revisão' ? 'Foi para a revisão' : 'Acertou em ' + g}</span>`).join('')}</div>`;

    const totNao = a.itens.reduce((s, it) => s + it.naoAntes, 0), totVirou = a.itens.reduce((s, it) => s + it.naoParaSim, 0);
    const calib = a.itens.reduce((s, it) => s + it.simFimAcertouAplicar, 0), calibTot = a.itens.reduce((s, it) => s + it.simFim, 0);
    $('pp-delta').innerHTML = a.concluidos
      ? `<strong>${totVirou} de ${totNao}</strong> respostas "não" viraram "sim" · ${a.concluidos} ${a.concluidos === 1 ? 'pessoa concluiu' : 'pessoas concluíram'}`
      : 'Aguardando os primeiros participantes concluírem…';
    $('pp-extra').innerHTML = ITENS.map((n, i) => `
      <div class="mini"><b>${a.itens[i].naoParaSim}/${a.itens[i].naoAntes}</b><span>${n}: não → sim</span></div>`).join('') + `
      <div class="mini"><b>${a.revisoes}</b><span>idas à revisão</span></div>
      <div class="mini wide"><b>${calibTot ? Math.round(calib / calibTot * 100) + '%' : '—'}</b><span>dos "sim" finais vieram de quem acertou de primeira em Aplicar (autoavaliação × desempenho)</span></div>`;
  }

  async function alternarEvento() {
    const aberto = dados?.config?.eventoAberto === 'sim';
    if (aberto && !confirm('Encerrar o evento? Novos alunos não conseguirão entrar.')) return;
    if (!aberto) {
      const b = await admin('banco');
      if (faltantes(b.questoes, b.config).some(s => !s.aprovada)) {
        if (!confirm('O kit de questões ainda não está 100% aprovado. Abrir mesmo assim? Os alunos verão "Evento em preparação".')) return;
      }
    }
    await admin('config', { mudancas: { eventoAberto: aberto ? 'nao' : 'sim' } });
    carregarPainel();
  }

  // ── Banco de Questões ─────────────────────────────────────────────────
  function slots(cfg) {
    const s = [];
    [1, 2, 3].forEach(c => {
      // Ordem importa: Aplicar primeiro; Compreender e Lembrar são regressões da versão acima
      ['Aplicar', 'Compreender', 'Lembrar'].forEach(n => s.push({ conceito: c, uso: 'treino', nivel: n }));
      s.push({ conceito: c, uso: 'remediacao', nivel: 'Lembrar' });
    });
    return s;
  }
  function doSlot(q, s, cfg) {
    return q.assunto === cfg.assunto && q.conceitoNome === cfg['conceito' + s.conceito] && Number(q.conceito) === s.conceito
      && q.uso === s.uso && (s.uso === 'remediacao' || q.nivel === s.nivel);
  }
  function faltantes(questoes, cfg) {
    return slots(cfg).map(s => {
      const qs = questoes.filter(q => doSlot(q, s, cfg));
      return Object.assign(s, { itens: qs, aprovada: qs.some(q => q.status === 'aprovada'), ativa: qs.some(q => q.status !== 'rejeitada') });
    });
  }

  async function carregarBanco() {
    $('banco-lista').innerHTML = '<p class="muted">Carregando…</p>';
    try {
      banco = await admin('banco');
      if (!banco.ok) throw new Error(banco.erro);
      const c = banco.config;
      $('cfg-assunto').value = c.assunto || ''; $('cfg-c1').value = c.conceito1 || '';
      $('cfg-c2').value = c.conceito2 || ''; $('cfg-c3').value = c.conceito3 || '';
      $('cfg-evento').value = c.eventoId || '';
      $('cfg-a1').value = c.auto1 || ''; $('cfg-a2').value = c.auto2 || ''; $('cfg-a3').value = c.auto3 || '';
      $('gen-chave').value = sessionStorage.getItem('bloom_api_key') || '';
      $('gen-modelo').value = localStorage.getItem('operamind_modelo_gerador') || MODELO_PADRAO;
      renderBanco();
    } catch (e) { $('banco-lista').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  const USO_ROTULO = { treino: 'Degrau', remediacao: 'Revisão (se errar em Lembrar)' };

  function renderBanco() {
    const cfg = banco.config;
    const ss = faltantes(banco.questoes, cfg);
    const aprovados = ss.filter(s => s.aprovada).length;
    $('banco-pronto').innerHTML = `Kit do evento: <strong>${aprovados}/${ss.length}</strong> posições com questão aprovada` +
      (aprovados === ss.length ? ' <span class="ok-pill">pronto</span>' : '');
    $('banco-lista').innerHTML = [1, 2, 3].map(c => `
      <div class="concept">
        <h3>Desafio ${c} · ${esc(cfg['conceito' + c])}</h3>
        ${ss.filter(s => s.conceito === c).map(s => `
          <div class="slot ${s.aprovada ? 'done' : ''}">
            <div class="slot-head"><span>${USO_ROTULO[s.uso]}${s.uso === 'remediacao' ? '' : ' · ' + s.nivel}</span>
              <button class="btn-admin small" data-gerar='${JSON.stringify({ conceito: s.conceito, uso: s.uso, nivel: s.nivel })}'>${s.itens.length ? 'Gerar outra' : 'Gerar'}</button></div>
            ${s.itens.length ? s.itens.slice().reverse().map(itemHtml).join('') : '<p class="muted small">Nenhuma questão gerada ainda.</p>'}
          </div>`).join('')}
      </div>`).join('');
    $('banco-lista').querySelectorAll('[data-gerar]').forEach(b => b.onclick = () => gerarLista([JSON.parse(b.dataset.gerar)]));
    $('banco-lista').querySelectorAll('[data-acao]').forEach(b => b.onclick = () => acaoItem(b.dataset.id, b.dataset.acao));
  }

  function itemHtml(q) {
    const alts = q.alternativas || [];
    const corpo = q.uso === 'remediacao'
      ? `<div class="q-title">${esc(q.pergunta)}</div><div class="q-exp" style="white-space:pre-line">${esc(q.explicacao)}</div>${alts[0] ? `<div class="q-exp">💡 ${esc(alts[0])}</div>` : ''}`
      : `<div class="q-title">${esc(q.pergunta)}</div>
         <ol class="q-alts">${alts.map((a, i) => `<li class="${i === Number(q.correta) ? 'right' : ''}">${esc(a)}</li>`).join('')}</ol>
         <div class="q-exp"><b>Explicação:</b> ${esc(q.explicacao)}</div>`;
    return `<div class="item st-${q.status}" id="it-${q.id}">
      <div class="item-meta"><span class="pill ${q.status}">${q.status}</span>${q.editada === 'sim' ? '<span class="pill">editada</span>' : ''}<span class="muted small">${esc(q.modelo || '')}</span></div>
      ${corpo}
      <div class="item-actions">
        ${q.status !== 'aprovada' ? `<button class="btn-admin small primary" data-acao="aprovar" data-id="${q.id}">Aprovar</button>` : ''}
        ${q.status !== 'rejeitada' ? `<button class="btn-admin small" data-acao="rejeitar" data-id="${q.id}">Rejeitar</button>` : ''}
        <button class="btn-admin small" data-acao="editar" data-id="${q.id}">Editar</button>
      </div></div>`;
  }

  async function acaoItem(id, acao) {
    const q = banco.questoes.find(x => x.id === id);
    if (acao === 'editar') return editarItem(q);
    const status = acao === 'aprovar' ? 'aprovada' : 'rejeitada';
    // Ao aprovar, as outras aprovadas da mesma posição voltam a pendente (uma por posição)
    if (status === 'aprovada') {
      const s = { conceito: Number(q.conceito), uso: q.uso, nivel: q.nivel };
      for (const o of banco.questoes.filter(o => o.id !== id && o.status === 'aprovada' && doSlot(o, s, banco.config))) {
        await admin('atualizarQuestao', { id: o.id, status: 'pendente' }); o.status = 'pendente';
      }
    }
    await admin('atualizarQuestao', { id, status });
    q.status = status; renderBanco();
  }

  function editarItem(q) {
    const el = $('it-' + q.id);
    const alts = q.alternativas || [];
    const rem = q.uso === 'remediacao';
    el.innerHTML = `<div class="edit">
      <label>${rem ? 'Título' : 'Pergunta'}<textarea id="ed-p">${esc(q.pergunta)}</textarea></label>
      ${rem ? `<label>Dica<textarea id="ed-a0">${esc(alts[0] || '')}</textarea></label>` :
        alts.map((a, i) => `<label><input type="radio" name="ed-c" value="${i}" ${i === Number(q.correta) ? 'checked' : ''}/> Alternativa ${'ABCD'[i]}${i === Number(q.correta) ? ' (correta)' : ''}<textarea id="ed-a${i}">${esc(a)}</textarea></label>`).join('')}
      <label>${rem ? 'Texto da revisão' : 'Explicação'}<textarea id="ed-e" rows="4">${esc(q.explicacao)}</textarea></label>
      <p class="muted small">A questão ficará marcada como "editada" na planilha, para transparência na metodologia.</p>
      <div class="item-actions"><button class="btn-admin small primary" id="ed-salvar">Salvar</button><button class="btn-admin small" id="ed-cancelar">Cancelar</button></div></div>`;
    $('ed-cancelar').onclick = renderBanco;
    $('ed-salvar').onclick = async () => {
      const edicao = { pergunta: $('ed-p').value, explicacao: $('ed-e').value };
      if (rem) edicao.alternativas = [$('ed-a0').value];
      else { edicao.alternativas = alts.map((_, i) => $('ed-a' + i).value); edicao.correta = Number((document.querySelector('input[name="ed-c"]:checked') || {}).value || 0); }
      await admin('atualizarQuestao', { id: q.id, edicao });
      Object.assign(q, edicao, { editada: 'sim' }); renderBanco();
    };
  }

  async function salvarConfig() {
    const mud = { assunto: $('cfg-assunto').value.trim(), conceito1: $('cfg-c1').value.trim(), conceito2: $('cfg-c2').value.trim(),
                  conceito3: $('cfg-c3').value.trim(), eventoId: $('cfg-evento').value.trim() || 'aula-01',
                  auto1: $('cfg-a1').value.trim(), auto2: $('cfg-a2').value.trim(), auto3: $('cfg-a3').value.trim() };
    const r = await admin('config', { mudancas: mud });
    banco.config = r.config; renderBanco(); log('Configuração salva.');
  }

  // Geração com o próprio Operamind: mesmo prompt (bloom.js) e mesmo formato do app
  async function chamarIA(prompt, chave, modelo, tentativa = 1) {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}`, 'HTTP-Referer': location.href, 'X-Title': 'Operamind' },
      body: JSON.stringify({ model: modelo, max_tokens: 1200, temperature: 0.7, messages: [
        { role: 'system', content: 'Você é especialista em pedagogia e Taxonomia de Bloom. Responda EXCLUSIVAMENTE com JSON válido, sem texto extra, sem markdown, sem ```json.' },
        { role: 'user', content: prompt }] }),
    });
    if (resp.status === 429 && tentativa < 4) { await esperar(15000); return chamarIA(prompt, chave, modelo, tentativa + 1); }
    if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
    const d = await resp.json();
    const raw = (d.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) { if (tentativa < 3) return chamarIA(prompt, chave, modelo, tentativa + 1); throw new Error('Resposta sem JSON'); }
    return JSON.parse(m[0]);
  }
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  async function gerarLista(lista) {
    if (gerando) return;
    const chave = $('gen-chave').value.trim(), modelo = $('gen-modelo').value.trim() || MODELO_PADRAO;
    if (!chave.startsWith('sk-or-')) { log('Informe sua chave OpenRouter (começa com sk-or-).', true); return; }
    sessionStorage.setItem('bloom_api_key', chave); localStorage.setItem('operamind_modelo_gerador', modelo);
    const cfg = banco.config;
    gerando = true; $('gen-tudo').disabled = true;
    try {
      for (let i = 0; i < lista.length; i++) {
        const s = lista[i];
        const tema = `${cfg.assunto} — conceito: ${cfg['conceito' + s.conceito]}`;
        log(`(${i + 1}/${lista.length}) Gerando ${USO_ROTULO[s.uso]} · conceito ${s.conceito}${s.uso === 'remediacao' ? '' : ' · ' + s.nivel}…`);
        try {
          let q;
          if (s.uso === 'remediacao') {
            const r = await chamarIA(buildRemediationPrompt(tema, 'Lembrar'), chave, modelo);
            if (!r.title || !r.body) throw new Error('remediação incompleta');
            q = { pergunta: r.title, alternativas: [r.tip || ''], correta: 0, explicacao: r.body };
          } else {
            const doDesafio = x => x.assunto === cfg.assunto && x.conceitoNome === cfg['conceito' + s.conceito] && x.uso === 'treino' && x.status !== 'rejeitada';
            // "Gerar outra": não repetir as versões já existentes neste degrau
            const evitar = banco.questoes.filter(x => doDesafio(x) && x.nivel === s.nivel).map(x => x.pergunta);
            // Regressão real do Operamind: Compreender nasce da versão Aplicar; Lembrar, da Compreender
            const acima = { Compreender: 'Aplicar', Lembrar: 'Compreender' }[s.nivel];
            let ref = null;
            if (acima) {
              const cand = banco.questoes.filter(x => doDesafio(x) && x.nivel === acima);
              ref = cand.find(x => x.status === 'aprovada') || cand[cand.length - 1] || null;
              if (!ref) throw new Error(`gere primeiro o degrau ${acima} deste desafio`);
            }
            const r = await chamarIA(buildPrompt(tema, s.nivel, ref ? ref.pergunta : null, !!ref, evitar), chave, modelo);
            if (!r.question || !Array.isArray(r.options) || r.options.length !== 4 || !(r.correctIndex >= 0 && r.correctIndex <= 3)) throw new Error('formato inválido');
            q = { pergunta: r.question, alternativas: r.options, correta: r.correctIndex, explicacao: r.explanation || '' };
          }
          Object.assign(q, { assunto: cfg.assunto, conceito: s.conceito, conceitoNome: cfg['conceito' + s.conceito], nivel: s.nivel, uso: s.uso, modelo });
          const sv = await admin('salvarQuestoes', { questoes: [q] });
          banco.questoes.push(Object.assign({ id: sv.ids[0], status: 'pendente', editada: 'nao' }, q));
          renderBanco();
        } catch (e) { log(`Falhou: ${e.message}`, true); }
        if (i < lista.length - 1 && modelo.endsWith(':free')) await esperar(3500); // respeita 20 pedidos/min dos modelos gratuitos
      }
      log('Concluído. Revise e aprove as questões abaixo.');
    } finally { gerando = false; $('gen-tudo').disabled = false; }
  }

  function gerarFaltantes() {
    const lista = faltantes(banco.questoes, banco.config).filter(s => !s.ativa);
    if (!lista.length) { log('Todas as posições já têm questão. Use "Gerar outra" numa posição específica, se quiser.'); return; }
    gerarLista(lista.map(({ conceito, uso, nivel }) => ({ conceito, uso, nivel })));
  }

  function log(msg, erro) {
    const el = $('gen-log');
    el.insertAdjacentHTML('afterbegin', `<div class="${erro ? 'err' : ''}">${new Date().toLocaleTimeString('pt-BR')} · ${esc(msg)}</div>`);
  }

  // ── Dados ─────────────────────────────────────────────────────────────
  async function carregarDados() {
    $('dados-conteudo').innerHTML = '<p class="muted">Carregando…</p>';
    try {
      const r = await admin('dados'); if (!r.ok) throw new Error(r.erro); dados = r;
      const a = analisar(r);
      const agrupar = campo => {
        const g = {};
        a.participantes.forEach(p => { const k = p[campo] || '—'; (g[k] = g[k] || []).push(p); });
        return Object.entries(g).sort((x, y) => y[1].length - x[1].length).map(([k, ps]) => {
          const c = ps.filter(p => p.completo);
          const m = f => c.length ? (c.reduce((s, p) => s + f(p), 0) / c.length / 3 * 100).toFixed(0) + '%' : '—';
          const rev = ps.reduce((s, p) => s + p.escada.filter(x => x === 'Revisão').length, 0);
          return `<tr><td>${esc(k)}</td><td>${ps.length}</td><td>${c.length}</td><td>${m(p => p.simAntes)}</td><td>${m(p => p.simDepois)}</td><td>${rev}</td></tr>`;
        }).join('');
      };
      const cab = '<tr><th>Grupo</th><th>Cadastrados</th><th>Concluíram</th><th>"Sim" antes</th><th>"Sim" depois</th><th>Idas à revisão</th></tr>';
      const sn = v => v === null ? '—' : v ? 'S' : 'N';
      const deg = g => ({ Aplicar: 'A', Compreender: 'C', Lembrar: 'L', 'Revisão': 'R' }[g] || '—');
      $('dados-conteudo').innerHTML = `
        <div class="row-actions">
          <button class="btn-admin" id="csv-p">Baixar participantes (CSV)</button>
          <button class="btn-admin" id="csv-r">Baixar respostas (CSV)</button>
          ${sessao.planilha ? `<a class="btn-admin" href="${esc(sessao.planilha)}" target="_blank" rel="noopener">Abrir planilha</a>` : ''}
        </div>
        <p class="muted small">Na aba Respostas da planilha, nas linhas de autoavaliação (forma = autorrelato), a coluna <code>acertou</code> significa "respondeu sim".</p>
        <h3 class="sub">Por nível de ensino</h3><div class="table-wrapper"><table>${cab}${agrupar('nivelEnsino')}</table></div>
        <h3 class="sub">Por área de formação</h3><div class="table-wrapper"><table>${cab}${agrupar('area')}</table></div>
        <h3 class="sub">Participantes (${a.participantes.length})</h3>
        <p class="muted small">Autoavaliação: S = sim, N = não (itens 1, 2, 3). Escada: degrau em que acertou cada desafio. A = Aplicar, C = Compreender, L = Lembrar, R = foi para a revisão.</p>
        <div class="table-wrapper"><table><tr><th>Código</th><th>Nível</th><th>Área</th><th>Antes</th><th>Escada</th><th>Depois</th></tr>
        ${a.participantes.map(p => `<tr><td><code>${esc(p.codigo)}</code></td><td>${esc(p.nivelEnsino)}</td><td>${esc(p.area)}</td>
          <td><code>${p.antes.map(sn).join(' ')}</code></td><td><code>${p.escada.map(deg).join(' ')}</code></td><td><code>${p.depois.map(sn).join(' ')}</code></td></tr>`).join('')}</table></div>`;
      $('csv-p').onclick = () => baixarCsv('participantes.csv', r.participantes);
      $('csv-r').onclick = () => baixarCsv('respostas.csv', r.respostas);
    } catch (e) { $('dados-conteudo').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  function baixarCsv(nome, linhas) {
    if (!linhas.length) { alert('Ainda não há dados.'); return; }
    const cols = Object.keys(linhas[0]);
    const cel = v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '\ufeff' + [cols.join(';'), ...linhas.map(l => cols.map(c => cel(l[c])).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function telaCheia() {
    const el = $('painel-projetar');
    if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.();
  }

  return { iniciar, sair, alternarEvento, gerarFaltantes, salvarConfig, telaCheia, analisar };
})();
