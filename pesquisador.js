/**
 * Operamind — Área do Pesquisador (v3)
 * Aulas (lista → painel, banco, dados, configurar/compartilhar), Administradores
 * (só o dono), Minha conta e Análise Geral. Depende de config.js, api.js e bloom.js.
 */
const PQ = (() => {
  const TODOS = ['Lembrar', 'Compreender', 'Aplicar', 'Analisar', 'Avaliar', 'Criar'];
  const MAX_AUTO = 10;
  // Perguntas de autoavaliação da aula (o servidor já resolve o formato antigo auto1..auto3)
  const autoDe = ev => (ev.autoItens && ev.autoItens.length ? ev.autoItens : [])
    .map((x, i) => ({ texto: x.texto, nivel: x.nivel || '', rotulo: `P${i + 1}` }));
  const curto = (t, n = 60) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  // Faixa da aula (Controle de Regressão)
  function faixa(ev) {
    const iPiso = ev.piso === 'Remediar' ? 0 : Math.max(0, TODOS.indexOf(ev.piso));
    const iTeto = Math.max(iPiso, TODOS.indexOf(ev.teto));
    return { iPiso, iTeto, remediar: ev.piso === 'Remediar', niveis: TODOS.slice(iPiso, iTeto + 1), porNivel: Math.max(1, Number(ev.porNivel) || 5) };
  }
  const MODELO_PADRAO = 'nvidia/nemotron-3-super-120b-a12b:free';
  const MODELOS_ANTIGOS = ['nvidia/nemotron-3-ultra-550b-a55b:free'];
  const ERROS = {
    credenciais_invalidas: 'E-mail ou senha incorretos.', muitas_tentativas: 'Muitas tentativas. Aguarde 15 minutos.',
    admin_nao_configurado: 'Nenhum administrador definido na planilha (menu Operamind).', sem_permissao: 'Você não tem permissão para isso.',
    so_o_dono_compartilha: 'Só quem criou a aula pode compartilhá-la.', so_o_dono_arquiva: 'Só quem criou a aula pode arquivá-la.',
    admin_inexistente: 'Esse e-mail não é de um administrador cadastrado.', email_invalido: 'E-mail inválido.',
    senha_curta: 'A senha precisa ter pelo menos 8 caracteres.', nivel_invalido: 'Nível inválido no Controle de Regressão.',
    piso_acima_do_teto: 'O piso não pode ficar acima do teto.', inicial_fora_da_faixa: 'O nível inicial precisa estar entre o piso e o teto.', ja_existe: 'Esse administrador já existe.',
    autoavaliacao_vazia: 'A Etapa 1 precisa de pelo menos uma pergunta.', autoavaliacao_demais: 'No máximo 10 perguntas de autoavaliação.',
    nao_pode_remover_a_si: 'Você não pode remover a própria conta.', senha_atual_incorreta: 'A senha atual está incorreta.',
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const msgErro = r => ERROS[r.erro] || ('Erro: ' + r.erro);

  let sessao = null, eventoAtual = null, dados = null, banco = null, timerPainel = null, gerando = false;

  // ── Sessão ────────────────────────────────────────────────────────────
  function lerSessao() { try { return JSON.parse(sessionStorage.getItem('operamind_admin') || 'null'); } catch { return null; } }
  function gravarSessao(s) { sessao = s; sessionStorage.setItem('operamind_admin', JSON.stringify(s)); }

  async function admin(acao, extra = {}) {
    const r = await API.chamar(acao, Object.assign({ token: sessao?.token }, extra));
    if (!r.ok && r.erro === 'nao_autorizado') { sair(); throw new Error('Sessão expirada. Entre novamente.'); }
    return r;
  }

  function iniciar() {
    if (!API.configurado()) $('login-msg').innerHTML = 'A planilha ainda não foi conectada (config.js).';
    sessao = lerSessao();
    if (sessao?.token) entrarNaArea();
    $('login-form').onsubmit = async e => {
      e.preventDefault();
      const btn = $('login-btn'); btn.disabled = true; $('login-msg').textContent = 'Verificando…';
      try {
        const r = await API.chamar('login', { email: $('login-email').value, senha: $('login-senha').value });
        if (!r.ok) { $('login-msg').textContent = msgErro(r); return; }
        gravarSessao({ token: r.token, email: r.email, papel: r.papel, planilha: r.planilha });
        $('login-senha').value = ''; $('login-msg').textContent = '';
        entrarNaArea();
      } catch (err) { $('login-msg').textContent = 'Não foi possível conectar à planilha. ' + err.message; }
      finally { btn.disabled = false; }
    };
  }

  function entrarNaArea() {
    $('login-overlay').hidden = true; $('area').hidden = false;
    $('admin-email').textContent = sessao.email + (sessao.papel === 'dono' ? ' · principal' : '');
    document.querySelectorAll('[data-tab="admins"]').forEach(b => b.hidden = sessao.papel !== 'dono');
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => abrirAba(b.dataset.tab));
    abrirAba('aulas');
  }

  function sair() {
    sessionStorage.removeItem('operamind_admin'); sessao = null; clearInterval(timerPainel);
    $('area').hidden = true; $('login-overlay').hidden = false;
  }

  function abrirAba(nome) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === nome));
    document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id !== 'tab-' + nome);
    clearInterval(timerPainel);
    if (nome === 'aulas') listarAulas();
    if (nome === 'admins') carregarAdmins();
    if (nome === 'geral' && window.iniciarAnaliseGeral) window.iniciarAnaliseGeral();
  }

  // ── Lista de aulas ────────────────────────────────────────────────────
  async function listarAulas() {
    eventoAtual = null; clearInterval(timerPainel);
    $('aula-detalhe').hidden = true; $('aulas-lista').hidden = false;
    $('aulas-grid').innerHTML = '<p class="muted">Carregando…</p>';
    try {
      const r = await admin('eventos'); if (!r.ok) throw new Error(msgErro(r));
      $('aulas-grid').innerHTML = r.eventos.length ? r.eventos.map(e => `
        <button class="glass-card aula-card" data-ev="${esc(e.id)}">
          <div class="aula-top"><span class="pill ${e.aberto ? 'aprovada' : ''}">${e.aberto ? 'aberta' : 'fechada'}</span>
            ${e.meu ? (e.compartilhado.length ? `<span class="pill">compartilhada com ${e.compartilhado.length}</span>` : '') : `<span class="pill">de ${esc(e.dono)}</span>`}</div>
          <div class="aula-nome">${esc(e.nome)}</div>
          <div class="aula-assunto">${esc(e.assunto)}</div>
          <div class="aula-kpis"><span><b>${e.participantes}</b> cadastrados</span><span><b>${e.concluidos}</b> concluíram</span></div>
        </button>`).join('') : '<p class="muted">Você ainda não tem aulas. Crie a primeira.</p>';
      $('aulas-grid').querySelectorAll('[data-ev]').forEach(b => b.onclick = () => abrirAula(r.eventos.find(x => x.id === b.dataset.ev)));
    } catch (e) { $('aulas-grid').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  async function criarAula() {
    const nome = $('nova-nome').value.trim(), assunto = $('nova-assunto').value.trim();
    if (!nome) { $('nova-msg').textContent = 'Dê um nome à aula.'; return; }
    $('nova-btn').disabled = true;
    try {
      const r = await admin('criarEvento', { nome, assunto });
      if (!r.ok) { $('nova-msg').textContent = msgErro(r); return; }
      $('nova-nome').value = ''; $('nova-assunto').value = ''; $('nova-msg').textContent = ''; $('nova-form').hidden = true;
      const lista = await admin('eventos');
      abrirAula(lista.eventos.find(x => x.id === r.id), 'config');
    } finally { $('nova-btn').disabled = false; }
  }

  function abrirAula(ev, sub = 'painel') {
    eventoAtual = ev;
    $('aulas-lista').hidden = true; $('aula-detalhe').hidden = false;
    $('aula-titulo').textContent = ev.nome;
    $('aula-sub').textContent = ev.meu ? 'Sua aula' : `Compartilhada por ${ev.dono}`;
    document.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => abrirSub(b.dataset.sub));
    abrirSub(sub);
  }

  function abrirSub(nome) {
    document.querySelectorAll('[data-sub]').forEach(b => b.setAttribute('aria-selected', b.dataset.sub === nome));
    document.querySelectorAll('.sub-panel').forEach(p => p.hidden = p.id !== 'sub-' + nome);
    clearInterval(timerPainel);
    if (nome === 'painel') { carregarPainel(); timerPainel = setInterval(carregarPainel, 5000); }
    if (nome === 'banco') carregarBanco();
    if (nome === 'dados') carregarDados();
    if (nome === 'config') carregarConfig();
  }

  // ── Cálculos: autoavaliação → Operamind (faixa da aula) → autoavaliação → percepção ──
  function analisar(d) {
    const porCodigo = {};
    d.respostas.forEach(r => { (porCodigo[r.codigo] = porCodigo[r.codigo] || []).push(r); });
    const finaisTxt = String(d.evento.finais || '').split('\n').map(s => s.trim()).filter(Boolean);
    const F = faixa(d.evento);
    const idx = n => TODOS.indexOf(n);
    const AUTO = autoDe(d.evento), NA = AUTO.length || 1;
    const participantes = d.participantes.map(p => {
      const rs = porCodigo[p.codigo] || [];
      const auto = fase => AUTO.map((_, k) => { const r = rs.find(x => x.fase === fase && Number(x.posicao) === k + 1); return r ? Number(r.acertou) === 1 : null; });
      const op = rs.filter(r => r.fase === 'treino').sort((a, b) => Number(a.posicao) - Number(b.posicao));
      const iAcertos = op.filter(r => Number(r.acertou) === 1).map(r => idx(r.nivel));
      const bloco2 = {
        n: op.length, acertos: iAcertos.length,
        maxAcerto: iAcertos.length ? Math.max(...iAcertos) : -1,              // nível mais alto em que acertou
        subidas: op.filter(r => idx(r.nivelDepois) > idx(r.nivel)).length,
        descidas: op.filter(r => idx(r.nivelDepois) >= 0 && idx(r.nivelDepois) < idx(r.nivel)).length,
        revisoes: op.filter(r => Number(r.remediacao) === 1).length,
        acertouTeto: op.some(r => idx(r.nivel) === F.iTeto && Number(r.acertou) === 1), // começar no teto não conta
        acertouNoItem: AUTO.map(it => !!it.nivel && op.some(r => r.nivel === it.nivel && Number(r.acertou) === 1)),
      };
      const percepcao = finaisTxt.map((_, i) => { const r = rs.find(x => x.fase === 'percepcao' && Number(x.posicao) === i + 1); return r ? Number(r.acertou) === 1 : null; });
      const antes = auto('auto_antes'), depois = auto('auto_depois');
      return Object.assign({}, p, { antes, depois, bloco2, percepcao,
        simAntes: antes.filter(Boolean).length, simDepois: depois.filter(Boolean).length,
        completo: antes.every(v => v !== null) && depois.every(v => v !== null) && bloco2.n > 0 });
    });
    const com = f => participantes.filter(f);
    const pct = (arr, f) => arr.length ? arr.filter(f).length / arr.length * 100 : 0;
    const temAntes = com(p => p.antes.every(v => v !== null)), temDepois = com(p => p.depois.every(v => v !== null));
    const pares = com(p => p.completo), jogaram = com(p => p.bloco2.n > 0);
    const itens = AUTO.map((it, i) => {
      const naoAntes = jogaram.filter(p => p.antes[i] === false);
      return {
        simAntes: pct(temAntes, p => p.antes[i]), simDepois: pct(temDepois, p => p.depois[i]),
        naoParaSim: pares.filter(p => p.antes[i] === false && p.depois[i] === true).length,
        naoAntes: pares.filter(p => p.antes[i] === false).length,
        // Disse "não" antes e, no Operamind, acertou ao menos uma pergunta daquele nível
        naoSabiaAcertou: naoAntes.filter(p => p.bloco2.acertouNoItem[i]).length, naoSabiaTotal: naoAntes.length,
        simFimAcertou: pares.filter(p => p.depois[i] === true && p.bloco2.acertouNoItem[i]).length,
        simFim: pares.filter(p => p.depois[i] === true).length,
        texto: it.texto, nivel: it.nivel, rotulo: it.rotulo,
        cruza: !!it.nivel && F.niveis.includes(it.nivel), // o nível da pergunta existe na faixa da aula?
      };
    });
    const porNivel = F.niveis.map(n => {
      const rs = d.respostas.filter(r => r.fase === 'treino' && r.nivel === n);
      return { nivel: n, total: rs.length, acertos: rs.filter(r => Number(r.acertou) === 1).length,
               alcancaram: jogaram.filter(p => p.bloco2.maxAcerto >= idx(n)).length };
    });
    const percepcao = finaisTxt.map((t, i) => {
      const resp = com(p => p.percepcao[i] !== null);
      return { texto: t, n: resp.length, sim: resp.filter(p => p.percepcao[i]).length };
    });
    const media = f => jogaram.length ? jogaram.reduce((s, p) => s + f(p), 0) / jogaram.length : 0;
    return { participantes, pares, jogaram, F, AUTO, NA, cadastrados: d.participantes.length, concluidos: pares.length, itens, porNivel, percepcao,
      mediaSimAntes: temAntes.length ? temAntes.reduce((s, p) => s + p.simAntes, 0) / temAntes.length / NA * 100 : 0,
      mediaSimDepois: temDepois.length ? temDepois.reduce((s, p) => s + p.simDepois, 0) / temDepois.length / NA * 100 : 0,
      acertaramTeto: jogaram.filter(p => p.bloco2.acertouTeto).length,
      precisaramRevisao: jogaram.filter(p => p.bloco2.revisoes > 0).length,
      mediaPerguntas: media(p => p.bloco2.n), mediaSubidas: media(p => p.bloco2.subidas), mediaDescidas: media(p => p.bloco2.descidas),
      nAntes: temAntes.length, nDepois: temDepois.length };
  }

  // ── Painel ────────────────────────────────────────────────────────────
  async function carregarPainel() {
    if (!eventoAtual) return;
    try {
      const r = await admin('dados', { eventoId: eventoAtual.id }); if (!r.ok) throw new Error(msgErro(r));
      dados = r; renderPainel();
      $('painel-status').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    } catch (e) { $('painel-status').textContent = 'Falha ao atualizar: ' + e.message; }
  }

  function renderPainel() {
    const a = analisar(dados), ev = dados.evento;
    const aberto = ev.aberto === 'sim';
    const link = new URL('evento.html?e=' + encodeURIComponent(ev.id), location.href).href;
    $('ev-toggle').textContent = aberto ? 'Encerrar evento' : 'Abrir evento';
    $('ev-toggle').className = 'btn-admin ' + (aberto ? 'danger' : 'primary');
    $('ev-estado').innerHTML = aberto ? '<span class="dot on"></span>Evento aberto' : '<span class="dot"></span>Evento fechado';
    $('ev-link').textContent = link; $('ev-link').href = link;
    $('ev-teste').href = link + '&teste=1';
    if ($('qr').dataset.link !== link) {
      $('qr').innerHTML = ''; $('qr').dataset.link = link;
      if (window.QRCode) new QRCode($('qr'), { text: link, width: 168, height: 168, colorDark: '#000', colorLight: '#fff' });
      else $('qr').innerHTML = '<span style="font-size:12px;color:#555;text-align:center">QR indisponível — use o link</span>';
    }
    $('k-cad').textContent = a.cadastrados; $('k-fim').textContent = a.concluidos;

    const barras = lado => a.itens.map((it, i) => {
      const v = lado === 'antes' ? it.simAntes : it.simDepois;
      return `<div class="lvbar" title="${esc(it.texto)}"><span>${esc(curto(it.texto, 34))}</span><div class="lvtrack"><div class="lvfill" style="width:${v.toFixed(0)}%"></div></div><b>${v.toFixed(0)}%</b></div>`;
    }).join('');
    $('card-antes').innerHTML = `<div class="pp-label">Etapa 1 · Antes</div><div class="pp-big">${a.mediaSimAntes.toFixed(0)}%</div>
      <div class="pp-sub">responderam "sim" (n=${a.nAntes})</div>${barras('antes')}`;
    $('card-depois').innerHTML = `<div class="pp-label">Etapa 3 · Depois</div><div class="pp-big accent">${a.mediaSimDepois.toFixed(0)}%</div>
      <div class="pp-sub">responderam "sim" (n=${a.nDepois})</div>${barras('depois')}`;

    const J = a.jogaram.length;
    $('pp-escada').innerHTML = `<div class="pp-label" style="margin-bottom:6px">Etapa 2 · Operamind em ação (faixa: ${a.F.remediar ? 'Remediar → ' : ''}${a.F.niveis.join(' → ')})</div>
      <div class="muted small" style="margin-bottom:16px">${J} ${J === 1 ? 'pessoa jogou' : 'pessoas jogaram'} · em média ${a.mediaPerguntas.toFixed(1)} perguntas, ${a.mediaSubidas.toFixed(1)} subidas e ${a.mediaDescidas.toFixed(1)} descidas de nível por pessoa</div>
      <div class="nivel-grid">${a.porNivel.map(n => `
        <div class="nivel-col"><div class="esc-title">${n.nivel}</div>
          <div class="lvbar" style="grid-template-columns:1fr 56px;margin-top:0"><div class="lvtrack"><div class="lvfill" style="width:${J ? n.alcancaram / J * 100 : 0}%"></div></div><b>${n.alcancaram}/${J}</b></div>
          <div class="esc-note">chegaram a acertar neste nível · taxa de acerto de ${n.total ? Math.round(n.acertos / n.total * 100) : 0}% em ${n.total} respostas</div></div>`).join('')}</div>
      <div class="nivel-kpis">
        <div><b>${a.acertaramTeto}/${J}</b><span>acertaram no nível máximo da aula (${a.F.niveis[a.F.niveis.length - 1]})</span></div>
        <div><b>${a.precisaramRevisao}/${J}</b><span>precisaram da revisão do conteúdo</span></div>
        ${a.itens.filter(it => it.cruza).map(it => `<div title="${esc(it.texto)}"><b>${it.naoSabiaAcertou}/${it.naoSabiaTotal}</b><span>disseram "não" em "${esc(curto(it.texto, 48))}" e acertaram em ${it.nivel}</span></div>`).join('')}
      </div>`;

    const totNao = a.itens.reduce((s, it) => s + it.naoAntes, 0), totVirou = a.itens.reduce((s, it) => s + it.naoParaSim, 0);
    const calib = a.itens.reduce((s, it) => s + it.simFimAcertou, 0), calibTot = a.itens.reduce((s, it) => s + it.simFim, 0);
    $('pp-delta').innerHTML = a.concluidos
      ? `<strong>${totVirou} de ${totNao}</strong> respostas "não" viraram "sim" · ${a.concluidos} ${a.concluidos === 1 ? 'pessoa concluiu' : 'pessoas concluíram'}`
      : 'Aguardando os primeiros participantes concluírem…';
    $('pp-extra').innerHTML = a.itens.map(it => `<div class="mini" title="${esc(it.texto)}"><b>${it.naoParaSim}/${it.naoAntes}</b><span>${esc(curto(it.texto, 40))}: não → sim</span></div>`).join('') + `
      <div class="mini"><b>${a.precisaramRevisao}</b><span>pessoas na revisão</span></div>
      <div class="mini wide"><b>${calibTot ? Math.round(calib / calibTot * 100) + '%' : '—'}</b><span>dos "sim" finais vieram de quem acertou ao menos uma pergunta daquele nível (autoavaliação × desempenho)</span></div>`;
    $('pp-percepcao').innerHTML = a.percepcao.length ? `<div class="pp-label" style="margin-bottom:10px">Percepção final</div>` + a.percepcao.map(q => `
      <div class="perc"><span>${esc(q.texto)}</span><b>${q.n ? Math.round(q.sim / q.n * 100) + '% sim' : '—'}</b><small>${q.sim}/${q.n}</small></div>`).join('') : '';
    $('pp-percepcao').hidden = !a.percepcao.length;
  }

  async function alternarEvento() {
    const aberto = dados?.evento?.aberto === 'sim';
    if (aberto && !confirm('Encerrar o evento? Novos alunos não conseguirão entrar.')) return;
    if (!aberto) {
      const b = await admin('banco', { eventoId: eventoAtual.id });
      if (estoques(b.questoes, b.evento).some(s => !s.aprovadas.length)
          && !confirm('Algum nível da faixa ainda não tem questão aprovada. Abrir mesmo assim? Os alunos verão "Evento em preparação".')) return;
    }
    await admin('atualizarEvento', { eventoId: eventoAtual.id, mudancas: { aberto: aberto ? 'nao' : 'sim' } });
    carregarPainel();
  }

  // ── Banco de questões ─────────────────────────────────────────────────
  // Estoque por nível da faixa: o objetivo da aula é a chave (mudou o objetivo → questões novas)
  const doEvento = (q, ev) => q.assunto === ev.objetivo;
  function estoques(questoes, ev) {
    const F = faixa(ev);
    const lista = F.niveis.map(n => {
      const qs = questoes.filter(q => doEvento(q, ev) && q.uso === 'estoque' && q.nivel === n);
      return { tipo: 'estoque', nivel: n, itens: qs, aprovadas: qs.filter(q => q.status === 'aprovada'),
               ativas: qs.filter(q => q.status !== 'rejeitada'), meta: F.porNivel };
    });
    if (F.remediar) {
      const qs = questoes.filter(q => doEvento(q, ev) && q.uso === 'remediacao');
      lista.push({ tipo: 'remediacao', nivel: 'Revisão', itens: qs, aprovadas: qs.filter(q => q.status === 'aprovada'),
                   ativas: qs.filter(q => q.status !== 'rejeitada'), meta: 1 });
    }
    return lista;
  }

  async function carregarBanco() {
    $('banco-lista').innerHTML = '<p class="muted">Carregando…</p>';
    try {
      banco = await admin('banco', { eventoId: eventoAtual.id }); if (!banco.ok) throw new Error(msgErro(banco));
      $('gen-chave').value = sessionStorage.getItem('bloom_api_key') || '';
      const salvo = localStorage.getItem('operamind_modelo_gerador');
      $('gen-modelo').value = salvo && !MODELOS_ANTIGOS.includes(salvo) ? salvo : MODELO_PADRAO;
      $('gen-log').innerHTML = ''; $('gen-prog').hidden = true;
      renderBanco();
    } catch (e) { $('banco-lista').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }



  function renderBanco() {
    const ev = banco.evento, F = faixa(ev), es = estoques(banco.questoes, ev);
    const ok = es.filter(e => e.aprovadas.length >= e.meta).length;
    $('banco-resumo').innerHTML = `<b>Objetivo:</b> ${esc(ev.objetivo)}<br><b>Faixa:</b> ${F.remediar ? 'Remediar → ' : ''}${F.niveis.join(' → ')} · começa em ${esc(ev.inicial)} · meta de ${F.porNivel} por nível
      <br><span class="muted small">Para mudar, use "Configurar e compartilhar".</span>`;
    $('banco-pronto').innerHTML = `Estoque: <strong>${ok}/${es.length}</strong> ${es.length === 1 ? 'grupo completo' : 'grupos completos'}` +
      (ok === es.length ? ' <span class="ok-pill">pronto</span>' : '');
    $('banco-lista').innerHTML = es.map(e => `
      <div class="slot ${e.aprovadas.length >= e.meta ? 'done' : ''}">
        <div class="slot-head"><span>${e.tipo === 'remediacao' ? `Revisão do conteúdo (níveis ${F.niveis.join(', ')})` : e.nivel}
          · <span class="muted">${e.aprovadas.length}/${e.meta} aprovada${e.meta > 1 ? 's' : ''}</span></span>
          <button class="btn-admin small" data-gerar='${JSON.stringify({ tipo: e.tipo, nivel: e.nivel })}'>Gerar mais uma</button></div>
        ${e.itens.length ? e.itens.slice().reverse().map(itemHtml).join('') : '<p class="muted small">Nenhuma questão gerada ainda.</p>'}
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
    if (status === 'aprovada' && q.uso === 'remediacao') { // uma revisão aprovada por vez
      for (const o of banco.questoes.filter(o => o.id !== id && o.uso === 'remediacao' && o.status === 'aprovada' && doEvento(o, banco.evento))) {
        await admin('atualizarQuestao', { id: o.id, status: 'pendente' }); o.status = 'pendente';
      }
    }
    await admin('atualizarQuestao', { id, status });
    q.status = status; renderBanco();
  }

  function editarItem(q) {
    const el = $('it-' + q.id), alts = q.alternativas || [], rem = q.uso === 'remediacao';
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

  // Geração com o próprio Operamind: mesmo prompt (bloom.js)
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  async function chamarIA(prompt, chave, modelo, tentativa = 1) {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}`, 'HTTP-Referer': location.href, 'X-Title': 'Operamind' },
      body: JSON.stringify({ model: modelo, max_tokens: 4000, temperature: 0.7, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Você é especialista em pedagogia e Taxonomia de Bloom. Responda EXCLUSIVAMENTE com JSON válido, sem texto extra, sem markdown, sem ```json.' },
          { role: 'user', content: prompt }] }),
    });
    if (resp.status === 429 && tentativa < 4) { await esperar(15000); return chamarIA(prompt, chave, modelo, tentativa + 1); }
    if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
    const d = await resp.json();
    if (d.error) {
      if (tentativa < 3) { await esperar(3000); return chamarIA(prompt, chave, modelo, tentativa + 1); }
      throw new Error('provedor: ' + (d.error.message || JSON.stringify(d.error).slice(0, 160)));
    }
    const ch = d.choices?.[0] || {}, conteudo = ch.message?.content || '', raciocinio = ch.message?.reasoning || '';
    let obj = null;
    for (const texto of [conteudo, raciocinio]) {
      const m = texto.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
      if (m) { try { obj = JSON.parse(m[0]); break; } catch {} }
    }
    if (!obj) {
      if (tentativa < 3) { await esperar(2000); return chamarIA(prompt, chave, modelo, tentativa + 1); }
      throw new Error((conteudo ? 'o modelo não devolveu JSON válido' : 'o modelo devolveu resposta vazia') + (ch.finish_reason ? ` (motivo: ${ch.finish_reason})` : '') + ' após 3 tentativas. Experimente outro modelo.');
    }
    return obj;
  }

  async function gerarUma(s, ev, chave, modelo) {
    const F = faixa(ev);
    // Mesmo gerador do app: o tema é o objetivo da aula, com a descrição como contexto
    const tema = ev.descricao ? `${ev.objetivo} (contexto da aula: ${ev.descricao})` : ev.objetivo;
    let q;
    if (s.tipo === 'remediacao') {
      const r = await chamarIA(buildRemediationPrompt(tema, F.niveis[0], F.niveis), chave, modelo);
      if (!r.title || !r.body) throw new Error('revisão incompleta');
      q = { pergunta: r.title, alternativas: [r.tip || ''], correta: 0, explicacao: r.body, nivel: 'Revisão', uso: 'remediacao' };
    } else {
      // Não repetir questões já existentes neste nível
      const evitar = banco.questoes.filter(x => doEvento(x, ev) && x.uso === 'estoque' && x.nivel === s.nivel && x.status !== 'rejeitada').map(x => x.pergunta);
      const r = await chamarIA(buildPrompt(tema, s.nivel, null, false, evitar), chave, modelo);
      if (!r.question || !Array.isArray(r.options) || r.options.length !== 4 || !(r.correctIndex >= 0 && r.correctIndex <= 3)) throw new Error('formato inválido');
      q = { pergunta: r.question, alternativas: r.options, correta: r.correctIndex, explicacao: r.explanation || '', nivel: s.nivel, uso: 'estoque' };
    }
    Object.assign(q, { assunto: ev.objetivo, conceito: 0, conceitoNome: '', modelo });
    const sv = await admin('salvarQuestoes', { eventoId: eventoAtual.id, questoes: [q] });
    if (!sv.ok) throw new Error(msgErro(sv));
    banco.questoes.push(Object.assign({ id: sv.ids[0], status: 'pendente', editada: 'nao' }, q));
    renderBanco();
  }

  async function gerarLista(lista) {
    if (gerando) return;
    const chave = $('gen-chave').value.trim(), modelo = $('gen-modelo').value.trim() || MODELO_PADRAO;
    if (!chave.startsWith('sk-or-')) { log('Informe sua chave OpenRouter (começa com sk-or-).', true); return; }
    sessionStorage.setItem('bloom_api_key', chave); localStorage.setItem('operamind_modelo_gerador', modelo);
    const ev = banco.evento, gratis = modelo.endsWith(':free');
    const rot = s => s.tipo === 'remediacao' ? 'Revisão do conteúdo' : `Questão de ${s.nivel}`;
    gerando = true; $('gen-tudo').disabled = true;
    const total = lista.length; let feitas = 0, falhas = [];
    const progresso = txt => { $('gen-prog').hidden = false; $('gen-prog-fill').style.width = (feitas / total * 100) + '%'; $('gen-prog-txt').textContent = txt; };
    try {
      for (let passada = 1; passada <= 2; passada++) {
        const fila = passada === 1 ? lista : falhas; falhas = [];
        if (passada === 2 && fila.length) log(`Tentando de novo ${fila.length} que falharam…`);
        for (const s of fila) {
          progresso(`${feitas}/${total} geradas · agora: ${rot(s)}`);
          log(`Gerando ${rot(s)}…`);
          try { await gerarUma(s, ev, chave, modelo); feitas++; log(`✓ ${rot(s)}`); }
          catch (e) { falhas.push(s); log(`✗ ${rot(s)}: ${e.message}`, true); }
          if (gratis) await esperar(3500); // respeita 20 pedidos/min dos modelos gratuitos
        }
        if (!falhas.length) break;
      }
      progresso(falhas.length ? `${feitas}/${total} geradas · ${falhas.length} falharam — clique em "Gerar o que falta" para tentar de novo`
                              : `${feitas}/${total} geradas · agora revise e aprove abaixo`);
      log(falhas.length ? `Concluído com ${falhas.length} falha(s).` : 'Concluído. Revise e aprove as questões abaixo.', !!falhas.length);
    } finally { gerando = false; $('gen-tudo').disabled = false; }
  }

  // Completa cada nível até a meta (contando as não rejeitadas), intercalando os níveis
  function gerarFaltantes() {
    const faltas = estoques(banco.questoes, banco.evento).map(e => ({ e, n: Math.max(0, e.meta - e.ativas.length) }));
    const lista = [];
    for (let rodada = 0; faltas.some(f => f.n > rodada); rodada++)
      faltas.forEach(f => { if (f.n > rodada) lista.push({ tipo: f.e.tipo, nivel: f.e.nivel }); });
    if (!lista.length) { log('Todos os níveis já atingiram a meta. Use "Gerar mais uma" se quiser ampliar o estoque.'); return; }
    gerarLista(lista);
  }

  function log(msg, erro) {
    $('gen-log').insertAdjacentHTML('afterbegin', `<div class="${erro ? 'err' : ''}">${new Date().toLocaleTimeString('pt-BR')} · ${esc(msg)}</div>`);
  }

  // ── Dados ─────────────────────────────────────────────────────────────
  async function carregarDados() {
    $('dados-conteudo').innerHTML = '<p class="muted">Carregando…</p>';
    try {
      const r = await admin('dados', { eventoId: eventoAtual.id }); if (!r.ok) throw new Error(msgErro(r)); dados = r;
      const a = analisar(r);
      const agrupar = campo => {
        const g = {};
        a.participantes.forEach(p => { const k = p[campo] || '—'; (g[k] = g[k] || []).push(p); });
        return Object.entries(g).sort((x, y) => y[1].length - x[1].length).map(([k, ps]) => {
          const c = ps.filter(p => p.completo);
          const m = f => c.length ? (c.reduce((s, p) => s + f(p), 0) / c.length / a.NA * 100).toFixed(0) + '%' : '—';
          const rev = ps.filter(p => p.bloco2.revisoes > 0).length;
          return `<tr><td>${esc(k)}</td><td>${ps.length}</td><td>${c.length}</td><td>${m(p => p.simAntes)}</td><td>${m(p => p.simDepois)}</td><td>${rev}</td></tr>`;
        }).join('');
      };
      const cab = '<tr><th>Grupo</th><th>Cadastrados</th><th>Concluíram</th><th>"Sim" antes</th><th>"Sim" depois</th><th>Precisaram da revisão</th></tr>';
      const sn = v => v === null ? '—' : v ? 'S' : 'N';
      const b2 = b => b.n ? `${b.n} perg. · ${b.acertos} acertos · máx ${b.maxAcerto >= 0 ? TODOS[b.maxAcerto] : '—'}${b.revisoes ? ` · ${b.revisoes} rev.` : ''}` : '—';
      $('dados-conteudo').innerHTML = `
        <div class="row-actions">
          <button class="btn-admin" id="csv-p">Baixar participantes (CSV)</button>
          <button class="btn-admin" id="csv-r">Baixar respostas (CSV)</button>
          ${sessao.planilha ? `<a class="btn-admin" href="${esc(sessao.planilha)}" target="_blank" rel="noopener">Abrir planilha</a>` : ''}
        </div>
        <p class="muted small">Nas linhas de autoavaliação e percepção (forma = autorrelato), a coluna <code>acertou</code> significa "respondeu sim".</p>
        <h3 class="sub">Por nível de ensino</h3><div class="table-wrapper"><table>${cab}${agrupar('nivelEnsino')}</table></div>
        <h3 class="sub">Por área de formação</h3><div class="table-wrapper"><table>${cab}${agrupar('area')}</table></div>
        <h3 class="sub">Participantes (${a.participantes.length})</h3>
        <p class="muted small">Autoavaliação: S = sim, N = não, na ordem das perguntas da aula. Operamind: perguntas respondidas, acertos, nível mais alto em que acertou e revisões. Percepção: respostas às perguntas finais.</p>
        <div class="table-wrapper"><table><tr><th>Código</th><th>Nível</th><th>Área</th><th>Antes</th><th>Operamind</th><th>Depois</th><th>Percepção</th></tr>
        ${a.participantes.map(p => `<tr><td><code>${esc(p.codigo)}</code></td><td>${esc(p.nivelEnsino)}</td><td>${esc(p.area)}</td>
          <td><code>${p.antes.map(sn).join(' ')}</code></td><td class="small">${b2(p.bloco2)}</td><td><code>${p.depois.map(sn).join(' ')}</code></td>
          <td><code>${p.percepcao.map(sn).join(' ') || '—'}</code></td></tr>`).join('')}</table></div>`;
      $('csv-p').onclick = () => baixarCsv(`participantes-${eventoAtual.id}.csv`, r.participantes);
      $('csv-r').onclick = () => baixarCsv(`respostas-${eventoAtual.id}.csv`, r.respostas);
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

  // ── Configurar e compartilhar ─────────────────────────────────────────
  const CAMPOS = ['nome', 'assunto', 'objetivo', 'descricao', 'piso', 'teto', 'inicial', 'porNivel'];
  const OPC_NIVEL = ['', ...TODOS];

  // Lista editável de perguntas (autoavaliação com nível; percepção só texto)
  function renderLista(id, itens, comNivel) {
    const el = $(id);
    el.innerHTML = itens.map((it, i) => `
      <div class="q-row" data-i="${i}">
        <span class="q-num">${i + 1}</span>
        <input class="inp q-txt" value="${esc(it.texto)}" placeholder="Escreva a pergunta (resposta sim/não)"/>
        ${comNivel ? `<select class="inp q-nivel" title="Nível de Bloom relacionado">${OPC_NIVEL.map(n => `<option value="${n}" ${n === it.nivel ? 'selected' : ''}>${n || 'Sem nível'}</option>`).join('')}</select>` : ''}
        <button class="btn-admin small" data-rm title="Remover">✕</button>
      </div>`).join('') || '<p class="muted small">Nenhuma pergunta.</p>';
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const lista = lerLista(id, comNivel); lista.splice(Number(b.closest('.q-row').dataset.i), 1);
      renderLista(id, lista, comNivel); if (comNivel) espelharEtapa3();
    });
    if (comNivel) el.querySelectorAll('.q-txt').forEach(x => x.oninput = espelharEtapa3);
  }
  function lerLista(id, comNivel) {
    return [...$(id).querySelectorAll('.q-row')].map(r => ({ texto: r.querySelector('.q-txt').value, nivel: comNivel ? r.querySelector('.q-nivel').value : '' }));
  }
  function adicionarPergunta(id) {
    const comNivel = id === 'cfg-auto-lista';
    const lista = lerLista(id, comNivel);
    if (comNivel && lista.length >= MAX_AUTO) { alert(`No máximo ${MAX_AUTO} perguntas de autoavaliação.`); return; }
    lista.push({ texto: '', nivel: '' });
    renderLista(id, lista, comNivel); if (comNivel) espelharEtapa3();
    const inputs = $(id).querySelectorAll('.q-txt'); inputs[inputs.length - 1].focus();
  }
  // A Etapa 3 repete exatamente as perguntas da Etapa 1 (comparação antes × depois)
  function espelharEtapa3() {
    const l = lerLista('cfg-auto-lista', true).filter(x => x.texto.trim());
    $('cfg-auto-espelho').innerHTML = l.length ? l.map((x, i) => `<li><span class="q-num">${i + 1}</span>${esc(x.texto)}</li>`).join('')
      : '<li class="muted small">As perguntas da Etapa 1 aparecerão aqui.</li>';
  }

  async function carregarConfig() {
    const r = await admin('banco', { eventoId: eventoAtual.id }); if (!r.ok) return;
    const ev = r.evento;
    CAMPOS.forEach(k => { $('cfg-' + k).value = ev[k] || ''; });
    renderLista('cfg-auto-lista', autoDe(ev).map(x => ({ texto: x.texto, nivel: x.nivel })), true);
    renderLista('cfg-finais-lista', String(ev.finais || '').split('\n').map(t => t.trim()).filter(Boolean).map(texto => ({ texto })), false);
    espelharEtapa3();
    const faixaTxt = () => {
      const f = faixa({ piso: $('cfg-piso').value, teto: $('cfg-teto').value });
      $('cfg-faixa').textContent = `Faixa desta aula: ${f.remediar ? 'Remediar → ' : ''}${f.niveis.join(' → ')}`;
    };
    ['cfg-piso', 'cfg-teto'].forEach(id => $(id).onchange = faixaTxt); faixaTxt();
    const meu = ev.dono === sessao.email;
    $('share-box').hidden = !meu; $('share-nao-dono').hidden = meu; $('arquivar-box').hidden = !meu;
    renderCompart(String(ev.compartilhado || '').split(',').filter(Boolean));
  }
  function renderCompart(lista) {
    $('share-lista').innerHTML = lista.length ? lista.map(e => `<li><span>${esc(e)}</span><button class="btn-admin small" data-rm="${esc(e)}">Remover</button></li>`).join('')
      : '<li class="muted small">Ainda não compartilhada.</li>';
    $('share-lista').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => compartilhar(b.dataset.rm, true));
  }
  async function salvarConfig() {
    const mudancas = {}; CAMPOS.forEach(k => { mudancas[k] = $('cfg-' + k).value.trim(); });
    const auto = lerLista('cfg-auto-lista', true).map(x => ({ texto: x.texto.trim(), nivel: x.nivel })).filter(x => x.texto);
    if (!auto.length) { $('cfg-msg').textContent = 'A Etapa 1 precisa de pelo menos uma pergunta.'; return; }
    mudancas.autoavaliacao = JSON.stringify(auto);
    mudancas.finais = lerLista('cfg-finais-lista', false).map(x => x.texto.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');
    const r = await admin('atualizarEvento', { eventoId: eventoAtual.id, mudancas });
    $('cfg-msg').textContent = r.ok ? 'Salvo.' : msgErro(r);
    if (r.ok) { eventoAtual.nome = mudancas.nome; $('aula-titulo').textContent = mudancas.nome; }
  }
  async function compartilhar(email, remover) {
    email = (email || $('share-email').value).trim().toLowerCase();
    if (!email) return;
    const r = await admin('compartilhar', { eventoId: eventoAtual.id, email, remover: !!remover });
    $('share-msg').textContent = r.ok ? (remover ? 'Removido.' : `Compartilhada com ${email}.`) : msgErro(r);
    if (r.ok) { $('share-email').value = ''; renderCompart(r.compartilhado); }
  }
  async function arquivar() {
    if (!confirm('Arquivar esta aula? Ela some das listas (sua e de quem tem acesso) e fica fechada. Os dados continuam na planilha.')) return;
    const r = await admin('arquivarEvento', { eventoId: eventoAtual.id });
    if (r.ok) listarAulas(); else alert(msgErro(r));
  }

  // ── Administradores (só o dono) ───────────────────────────────────────
  async function carregarAdmins() {
    $('admins-lista').innerHTML = '<p class="muted">Carregando…</p>';
    const r = await admin('admins');
    if (!r.ok) { $('admins-lista').innerHTML = `<p class="err">${esc(msgErro(r))}</p>`; return; }
    $('admins-lista').innerHTML = `<table><tr><th>E-mail</th><th>Papel</th><th>Criado em</th><th></th></tr>${r.admins.map(a => `
      <tr><td>${esc(a.email)}</td><td>${a.papel === 'dono' ? 'Principal' : 'Administrador'}</td>
      <td class="muted small">${a.criadoEm ? new Date(a.criadoEm).toLocaleDateString('pt-BR') : '—'}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn-admin small" data-senha="${esc(a.email)}">Definir nova senha</button>
        ${a.email === sessao.email ? '' : `<button class="btn-admin small danger" data-rm="${esc(a.email)}">Remover</button>`}</td></tr>`).join('')}</table>`;
    $('admins-lista').querySelectorAll('[data-senha]').forEach(b => b.onclick = async () => {
      const senha = prompt(`Nova senha para ${b.dataset.senha} (mínimo 8 caracteres):`);
      if (!senha) return;
      const x = await admin('redefinirSenha', { email: b.dataset.senha, senha });
      alert(x.ok ? 'Senha alterada. As sessões abertas dessa pessoa foram encerradas.' : msgErro(x));
      if (x.ok && b.dataset.senha === sessao.email) sair();
    });
    $('admins-lista').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      if (!confirm(`Remover o acesso de ${b.dataset.rm}? As aulas criadas por essa pessoa continuam na planilha.`)) return;
      const x = await admin('removerAdmin', { email: b.dataset.rm });
      if (!x.ok) alert(msgErro(x)); carregarAdmins();
    });
  }
  async function criarAdmin() {
    const email = $('adm-email').value.trim(), senha = $('adm-senha').value;
    const r = await admin('criarAdmin', { email, senha });
    $('adm-msg').textContent = r.ok ? `Administrador ${email} criado. Envie a senha a essa pessoa por um canal seguro.` : msgErro(r);
    if (r.ok) { $('adm-email').value = ''; $('adm-senha').value = ''; carregarAdmins(); }
  }

  // ── Minha conta ───────────────────────────────────────────────────────
  async function trocarSenha() {
    const r = await admin('trocarSenha', { senhaAtual: $('conta-atual').value, novaSenha: $('conta-nova').value });
    $('conta-msg').textContent = r.ok ? 'Senha alterada. Entre novamente.' : msgErro(r);
    if (r.ok) setTimeout(sair, 1200);
  }

  function telaCheia() {
    const el = $('painel-projetar');
    if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.();
  }

  return { iniciar, sair, listarAulas, criarAula, adicionarPergunta, alternarEvento, gerarFaltantes, salvarConfig, compartilhar, arquivar,
           criarAdmin, trocarSenha, telaCheia, analisar };
})();
