/**
 * Operamind — Servidor na Planilha Google (Apps Script) · versão 3
 *
 * Este arquivo vai DENTRO da planilha: Extensões → Apps Script → cole tudo aqui.
 * Veja o passo a passo em backend/COMO-CONFIGURAR.md.
 *
 * Abas:
 *   Admins         → administradores (senha só como hash com sal) e papel (dono/admin)
 *   Eventos        → aulas/eventos: dono, compartilhamento, textos e configuração
 *   Participantes  → código anônimo, nível de ensino, área (nunca nomes)
 *   Respostas      → uma linha por resposta (nunca nomes)
 *   Banco          → questões geradas pelo Operamind, por evento
 *   Config         → uso interno (versão da migração)
 *
 * A atualização da versão 2 para a 3 é automática: o administrador atual vira
 * "dono", a aula atual vira o primeiro evento e os dados existentes são ligados a ela.
 */

// ── Estrutura das abas (colunas novas sempre no fim, para não quebrar dados antigos) ──
const ABAS = {
  Admins:        ['email', 'hash', 'sal', 'papel', 'criadoEm', 'versao'],
  Eventos:       ['id', 'nome', 'dono', 'compartilhado', 'criadoEm', 'aberto', 'arquivado', 'assunto',
                  'conceito1', 'conceito2', 'conceito3', 'auto1', 'auto2', 'auto3', 'finais',
                  'objetivo', 'descricao', 'piso', 'teto', 'inicial', 'porNivel', 'autoavaliacao'],
  Participantes: ['registradoEm', 'codigo', 'nivelEnsino', 'area', 'ordem', 'consentimento',
                  'dispositivo', 'concluidoEm', 'acertosAntes', 'acertosDepois', 'eventoId'],
  Respostas:     ['registradoEm', 'codigo', 'fase', 'posicao', 'forma', 'conceito', 'nivel',
                  'questaoId', 'acertou', 'tempoMs', 'origem', 'remediacao', 'nivelDepois', 'eventoId'],
  Banco:         ['id', 'criadoEm', 'assunto', 'conceito', 'conceitoNome', 'nivel', 'uso',
                  'pergunta', 'alternativas', 'correta', 'explicacao', 'modelo', 'status', 'editada', 'eventoId'],
  Config:        ['chave', 'valor'],
};

const EVENTO_PADRAO = {
  assunto: 'Como a IA generativa funciona e por que erra',
  conceito1: 'O que é a IA generativa',
  conceito2: 'Como a IA generativa funciona e por que ela erra',
  conceito3: 'Como usar a IA generativa de forma crítica no dia a dia',
  auto1: 'Você sabe o que é IA generativa?',
  auto2: 'Você compreende como a IA generativa funciona, ou seja, como ela produz uma resposta?',
  auto3: 'Você sabe aplicar esse conhecimento, por exemplo, para perceber quando a IA está errando?',
  finais: 'Você sente que as perguntas e os feedbacks do Operamind ajudaram você a absorver conhecimento sobre o assunto?',
  // Bloco 2 = Operamind normal dentro de uma faixa de níveis (Controle de Regressão)
  objetivo: 'Aprender como a IA generativa funciona e por que ela erra',
  descricao: 'Os alunos devem ir do nível Lembrar até o Aplicar; mais do que isso não é necessário nesta aula.',
  piso: 'Remediar',   // 'Remediar' = pode descer até Lembrar e, errando lá, recebe a remediação
  teto: 'Aplicar',
  inicial: 'Aplicar',
  porNivel: '5',      // questões aprovadas desejadas no estoque de cada nível
  // Autoavaliação (Etapas 1 e 3, mesmas perguntas): lista em JSON [{ texto, nivel }]; vazia = usa auto1..auto3
  autoavaliacao: '',
};
const MAX_AUTO = 10;
const NIVEIS_BLOOM = ['Lembrar', 'Compreender', 'Aplicar', 'Analisar', 'Avaliar', 'Criar'];
const CAMPOS_EDITAVEIS = ['nome', 'aberto', 'assunto', 'auto1', 'auto2', 'auto3', 'finais',
                          'objetivo', 'descricao', 'piso', 'teto', 'inicial', 'porNivel', 'autoavaliacao'];

// Perguntas de autoavaliação da aula (formato novo em JSON, ou as 3 fixas das versões anteriores)
function autoItens_(ev) {
  const lista = parseJson_(ev.autoavaliacao, null);
  if (Array.isArray(lista) && lista.length) {
    return lista.slice(0, MAX_AUTO).map(x => ({ texto: String(x.texto || '').slice(0, 300), nivel: NIVEIS_BLOOM.indexOf(x.nivel) >= 0 ? x.nivel : '' }))
      .filter(x => x.texto.trim());
  }
  return [{ texto: ev.auto1, nivel: 'Lembrar' }, { texto: ev.auto2, nivel: 'Compreender' }, { texto: ev.auto3, nivel: 'Aplicar' }]
    .filter(x => String(x.texto || '').trim());
}
const VERSAO_DADOS = '4'; // a migração é idempotente: reexecutar só acrescenta o que falta

// ── Menu da planilha ────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Operamind')
    .addItem('1. Preparar abas', 'prepararAbas')
    .addItem('2. Definir administrador principal (dono)', 'definirAdmin')
    .addToUi();
}

function prepararAbas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(nome => {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    if (sh.getLastRow() === 0) {
      sh.appendRow(ABAS[nome]);
      sh.setFrozenRows(1);
    } else {
      // Acrescenta colunas que faltarem no cabeçalho (atualização de versão)
      const cab = sh.getDataRange().getValues()[0];
      ABAS[nome].forEach(c => { if (cab.indexOf(c) < 0) { cab.push(c); sh.getRange(1, cab.length).setValue(c); } });
    }
    sh.getRange(1, 1, 1, ABAS[nome].length).setFontWeight('bold');
  });
  try { SpreadsheetApp.getUi().alert('Abas prontas.'); } catch (e) {}
}

function definirAdmin() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt('E-mail do administrador principal', 'Este administrador pode gerenciar os demais:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt('Senha', 'Mínimo 8 caracteres. Será guardada apenas como hash:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  const email = r1.getResponseText().trim().toLowerCase(), senha = r2.getResponseText();
  if (!email.includes('@') || senha.length < 8) { ui.alert('E-mail inválido ou senha muito curta.'); return; }
  migrar_();
  comTrava_(() => salvarAdmin_(email, senha, 'dono'));
  ui.alert('Administrador principal definido: ' + email);
}

function salvarAdmin_(email, senha, papel) {
  const sal = Utilities.getUuid();
  const existente = lerLinhas_('Admins').find(a => a.email === email);
  if (existente) {
    atualizarLinhas_('Admins', a => a.email === email, { hash: hash_(sal + senha), sal, papel: papel || existente.papel, versao: Number(existente.versao || 1) + 1 });
  } else {
    anexar_('Admins', { email, hash: hash_(sal + senha), sal, papel: papel || 'admin', criadoEm: new Date(), versao: 1 });
  }
}

// ── Migração automática (v2 → v3) ───────────────────────────────────────────
function migrar_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DADOS_VERSAO') === VERSAO_DADOS) return;
  comTrava_(() => {
    if (props.getProperty('DADOS_VERSAO') === VERSAO_DADOS) return;
    prepararAbasSilencioso_();
    const p = props.getProperties();
    // Administrador da versão anterior vira o dono
    if (p.ADMIN_EMAIL && !lerLinhas_('Admins').some(a => a.email === p.ADMIN_EMAIL)) {
      anexar_('Admins', { email: p.ADMIN_EMAIL, hash: p.ADMIN_HASH, sal: p.ADMIN_SAL, papel: 'dono', criadoEm: new Date(), versao: 1 });
    }
    // Configuração antiga vira o primeiro evento
    const cfg = {};
    lerLinhas_('Config').forEach(l => { if (l.chave) cfg[l.chave] = String(l.valor); });
    const dono = p.ADMIN_EMAIL || (lerLinhas_('Admins')[0] || {}).email || '';
    let idLegado = null;
    if (!lerLinhas_('Eventos').length && dono) {
      idLegado = cfg.eventoId || 'aula-01';
      const ev = Object.assign({}, EVENTO_PADRAO);
      ['assunto', 'conceito1', 'conceito2', 'conceito3', 'auto1', 'auto2', 'auto3'].forEach(k => { if (cfg[k]) ev[k] = cfg[k]; });
      anexar_('Eventos', Object.assign(ev, { id: idLegado, nome: 'Aula — Educação em Computação', dono, compartilhado: '',
        criadoEm: new Date(), aberto: cfg.eventoAberto === 'sim' ? 'sim' : 'nao', arquivado: 'nao' }));
    }
    // Liga os dados antigos ao evento legado
    if (idLegado) ['Participantes', 'Respostas', 'Banco'].forEach(aba => atualizarLinhas_(aba, l => !l.eventoId, { eventoId: idLegado }));
    props.setProperty('DADOS_VERSAO', VERSAO_DADOS);
  });
}

function prepararAbasSilencioso_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(nome => {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    if (sh.getLastRow() === 0) { sh.appendRow(ABAS[nome]); sh.setFrozenRows(1); return; }
    const cab = sh.getDataRange().getValues()[0];
    ABAS[nome].forEach(c => { if (cab.indexOf(c) < 0) { cab.push(c); sh.getRange(1, cab.length).setValue(c); } });
  });
}

// ── Entrada HTTP ────────────────────────────────────────────────────────────
function doGet() {
  return json_({ ok: true, servico: 'operamind', versao: VERSAO_DADOS, hora: new Date().toISOString() });
}

function doPost(e) {
  try {
    migrar_();
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const publico = { eventosAbertos: acaoEventosAbertos_, evento: acaoEvento_, registrar: acaoRegistrar_,
                      respostas: acaoRespostas_, concluir: acaoConcluir_, login: acaoLogin_ };
    const admin = { eventos: acaoEventos_, criarEvento: acaoCriarEvento_, atualizarEvento: acaoAtualizarEvento_,
                    compartilhar: acaoCompartilhar_, arquivarEvento: acaoArquivarEvento_,
                    dados: acaoDados_, banco: acaoBanco_, salvarQuestoes: acaoSalvarQuestoes_,
                    atualizarQuestao: acaoAtualizarQuestao_, trocarSenha: acaoTrocarSenha_ };
    const dono = { admins: acaoAdmins_, criarAdmin: acaoCriarAdmin_, removerAdmin: acaoRemoverAdmin_,
                   redefinirSenha: acaoRedefinirSenha_ };
    const acao = req.acao;
    if (publico[acao]) return json_(publico[acao](req));
    const quem = adminAtual_(req.token);
    if (!quem) return json_({ ok: false, erro: 'nao_autorizado' });
    if (admin[acao]) return json_(admin[acao](req, quem));
    if (dono[acao]) {
      if (quem.papel !== 'dono') return json_({ ok: false, erro: 'sem_permissao' });
      return json_(dono[acao](req, quem));
    }
    return json_({ ok: false, erro: 'acao_desconhecida' });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  }
}

// ── Eventos: auxiliares ─────────────────────────────────────────────────────
// Campos vazios (eventos antigos) recebem os valores padrão
function comPadrao_(ev) {
  if (!ev) return ev;
  Object.keys(EVENTO_PADRAO).forEach(k => { if (ev[k] === '' || ev[k] == null) ev[k] = EVENTO_PADRAO[k]; });
  return ev;
}
function lerEvento_(id) { return comPadrao_(lerLinhas_('Eventos').find(e => e.id === id) || null); }
function listaCompartilhada_(ev) { return String(ev.compartilhado || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean); }
function podeVer_(ev, email) { return !!ev && ev.arquivado !== 'sim' && (ev.dono === email || listaCompartilhada_(ev).indexOf(email) >= 0); }
function eventoPublico_(ev) {
  const finais = String(ev.finais || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 5);
  return { id: ev.id, nome: ev.nome, assunto: ev.assunto, autoavaliacao: autoItens_(ev), finais,
           piso: ev.piso, teto: ev.teto, inicial: ev.inicial, aberto: ev.aberto === 'sim' };
}

// ── Ações públicas (alunos) ─────────────────────────────────────────────────
function acaoEventosAbertos_() {
  return { ok: true, eventos: lerLinhas_('Eventos').filter(e => e.aberto === 'sim' && e.arquivado !== 'sim')
    .map(e => ({ id: e.id, nome: e.nome, assunto: e.assunto })) };
}

function acaoEvento_(req) {
  const id = String(req.eventoId || '');
  const cache = CacheService.getScriptCache();
  const salvo = cache.get('ev_' + id);
  if (salvo) return JSON.parse(salvo);
  const ev = lerEvento_(id);
  if (!ev || ev.arquivado === 'sim') return { ok: false, erro: 'evento_inexistente' };
  const questoes = lerLinhas_('Banco')
    // O objetivo da aula é a "chave" do estoque: mudar o objetivo exige gerar questões novas
    .filter(q => q.eventoId === id && q.status === 'aprovada' && q.assunto === ev.objetivo && (q.uso === 'estoque' || q.uso === 'remediacao'))
    .map(q => ({ id: q.id, nivel: q.nivel, uso: q.uso, pergunta: q.pergunta,
                 alternativas: parseJson_(q.alternativas, []), correta: Number(q.correta), explicacao: q.explicacao }));
  const resp = Object.assign({ ok: true, eventoId: id, questoes }, eventoPublico_(ev));
  try { cache.put('ev_' + id, JSON.stringify(resp), 15); } catch (e) {}
  return resp;
}
function limparCacheEvento_(id) { CacheService.getScriptCache().remove('ev_' + id); }

function acaoRegistrar_(req) {
  const ev = lerEvento_(String(req.eventoId || ''));
  if (!ev || ev.aberto !== 'sim' || ev.arquivado === 'sim') return { ok: false, erro: 'evento_fechado' };
  const p = req.participante || {};
  if (!/^P-[A-Z0-9]{5}$/.test(p.codigo || '')) return { ok: false, erro: 'codigo_invalido' };
  return comTrava_(() => {
    if (lerLinhas_('Participantes').some(x => x.codigo === p.codigo)) return { ok: true, repetido: true };
    anexar_('Participantes', { registradoEm: new Date(), codigo: p.codigo, nivelEnsino: limpa_(p.nivelEnsino, 60),
      area: limpa_(p.area, 80), ordem: 'escada', consentimento: 'sim', dispositivo: limpa_(p.dispositivo, 20), eventoId: ev.id });
    return { ok: true };
  });
}

function acaoRespostas_(req) {
  const codigo = req.codigo || '';
  if (!/^P-[A-Z0-9]{5}$/.test(codigo)) return { ok: false, erro: 'codigo_invalido' };
  const eventoId = limpa_(req.eventoId, 40);
  const lista = Array.isArray(req.respostas) ? req.respostas.slice(0, 30) : [];
  return comTrava_(() => {
    const ja = new Set(lerLinhas_('Respostas').filter(r => r.codigo === codigo).map(r => r.fase + '#' + r.posicao));
    let n = 0;
    lista.forEach(r => {
      const chave = r.fase + '#' + r.posicao;
      if (ja.has(chave)) return; // reenvio: ignora duplicata
      anexar_('Respostas', { registradoEm: new Date(), codigo, fase: limpa_(r.fase, 20), posicao: Number(r.posicao) || 0,
        forma: limpa_(r.forma, 20), conceito: Number(r.conceito) || 0, nivel: limpa_(r.nivel, 20),
        questaoId: limpa_(r.questaoId, 40), acertou: r.acertou ? 1 : 0, tempoMs: Number(r.tempoMs) || 0,
        origem: limpa_(r.origem, 30), remediacao: r.remediacao ? 1 : 0, nivelDepois: limpa_(r.nivelDepois, 20), eventoId });
      ja.add(chave); n++;
    });
    return { ok: true, gravadas: n };
  });
}

function acaoConcluir_(req) {
  return comTrava_(() => {
    const n = atualizarLinhas_('Participantes', l => l.codigo === req.codigo,
      { concluidoEm: new Date(), acertosAntes: Number(req.antes) || 0, acertosDepois: Number(req.depois) || 0 });
    return n ? { ok: true } : { ok: false, erro: 'nao_encontrado' };
  });
}

function acaoLogin_(req) {
  const cache = CacheService.getScriptCache();
  const tentativas = Number(cache.get('login_falhas') || 0);
  if (tentativas >= 10) return { ok: false, erro: 'muitas_tentativas' };
  const email = String(req.email || '').trim().toLowerCase();
  const adm = lerLinhas_('Admins').find(a => a.email === email);
  if (!adm) {
    if (!lerLinhas_('Admins').length) return { ok: false, erro: 'admin_nao_configurado' };
  }
  if (!adm || hash_(adm.sal + String(req.senha || '')) !== adm.hash) {
    cache.put('login_falhas', String(tentativas + 1), 900); // bloqueia 15 min após 10 erros
    Utilities.sleep(700);
    return { ok: false, erro: 'credenciais_invalidas' };
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('tok_' + token, email + '|' + (adm.versao || 1), 21600); // 6 horas
  return { ok: true, token, email, papel: adm.papel, planilha: SpreadsheetApp.getActiveSpreadsheet().getUrl() };
}

function adminAtual_(token) {
  if (!token) return null;
  const v = CacheService.getScriptCache().get('tok_' + token);
  if (!v) return null;
  const partes = v.split('|');
  const adm = lerLinhas_('Admins').find(a => a.email === partes[0]);
  // Senha trocada ou administrador removido invalidam o token
  if (!adm || String(adm.versao || 1) !== String(partes[1])) return null;
  return { email: adm.email, papel: adm.papel };
}

// ── Ações de administrador ──────────────────────────────────────────────────
function acaoEventos_(req, quem) {
  const parts = lerLinhas_('Participantes');
  const eventos = lerLinhas_('Eventos').map(comPadrao_).filter(e => podeVer_(e, quem.email)).map(e => ({
    id: e.id, nome: e.nome, assunto: e.assunto, dono: e.dono, compartilhado: listaCompartilhada_(e),
    criadoEm: e.criadoEm, aberto: e.aberto === 'sim', meu: e.dono === quem.email,
    participantes: parts.filter(p => p.eventoId === e.id).length,
    concluidos: parts.filter(p => p.eventoId === e.id && p.concluidoEm).length,
  })).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  return { ok: true, eventos, eu: quem };
}

function acaoCriarEvento_(req, quem) {
  const nome = limpa_(req.nome, 120).trim() || 'Nova aula';
  const id = 'ev-' + Utilities.getUuid().slice(0, 8);
  return comTrava_(() => {
    const ev = Object.assign({}, EVENTO_PADRAO, { id, nome, dono: quem.email, compartilhado: '', criadoEm: new Date(), aberto: 'nao', arquivado: 'nao' });
    if (req.assunto) ev.assunto = limpa_(req.assunto, 200);
    anexar_('Eventos', ev);
    return { ok: true, id };
  });
}

function acaoAtualizarEvento_(req, quem) {
  const ev = lerEvento_(req.eventoId);
  if (!podeVer_(ev, quem.email)) return { ok: false, erro: 'sem_permissao' };
  const mud = {};
  Object.keys(req.mudancas || {}).forEach(k => {
    if (CAMPOS_EDITAVEIS.indexOf(k) >= 0) mud[k] = limpa_(req.mudancas[k], k === 'autoavaliacao' ? 4000 : k === 'finais' || k === 'descricao' ? 3000 : 300);
  });
  if (mud.autoavaliacao !== undefined) {
    const lista = parseJson_(mud.autoavaliacao, null);
    if (!Array.isArray(lista) || !lista.filter(x => String(x.texto || '').trim()).length) return { ok: false, erro: 'autoavaliacao_vazia' };
    if (lista.length > MAX_AUTO) return { ok: false, erro: 'autoavaliacao_demais' };
  }
  // Controle de Regressão coerente: piso ≤ inicial ≤ teto
  const f = Object.assign({}, ev, mud);
  const iPiso = f.piso === 'Remediar' ? 0 : NIVEIS_BLOOM.indexOf(f.piso), iTeto = NIVEIS_BLOOM.indexOf(f.teto), iIni = NIVEIS_BLOOM.indexOf(f.inicial);
  if (iPiso < 0 || iTeto < 0 || iIni < 0) return { ok: false, erro: 'nivel_invalido' };
  if (iPiso > iTeto) return { ok: false, erro: 'piso_acima_do_teto' };
  if (iIni < iPiso || iIni > iTeto) return { ok: false, erro: 'inicial_fora_da_faixa' };
  comTrava_(() => atualizarLinhas_('Eventos', e => e.id === ev.id, mud));
  limparCacheEvento_(ev.id);
  return { ok: true, evento: lerEvento_(ev.id) };
}

function acaoCompartilhar_(req, quem) {
  const ev = lerEvento_(req.eventoId);
  if (!ev || ev.dono !== quem.email) return { ok: false, erro: 'so_o_dono_compartilha' };
  const email = String(req.email || '').trim().toLowerCase();
  if (!lerLinhas_('Admins').some(a => a.email === email)) return { ok: false, erro: 'admin_inexistente' };
  let lista = listaCompartilhada_(ev).filter(x => x !== email);
  if (!req.remover && email !== ev.dono) lista.push(email);
  comTrava_(() => atualizarLinhas_('Eventos', e => e.id === ev.id, { compartilhado: lista.join(',') }));
  return { ok: true, compartilhado: lista };
}

function acaoArquivarEvento_(req, quem) {
  const ev = lerEvento_(req.eventoId);
  if (!ev || ev.dono !== quem.email) return { ok: false, erro: 'so_o_dono_arquiva' };
  // Os dados continuam na planilha; o evento só some das listas
  comTrava_(() => atualizarLinhas_('Eventos', e => e.id === ev.id, { arquivado: 'sim', aberto: 'nao' }));
  limparCacheEvento_(ev.id);
  return { ok: true };
}

function acaoDados_(req, quem) {
  const ev = lerEvento_(req.eventoId);
  if (!podeVer_(ev, quem.email)) return { ok: false, erro: 'sem_permissao' };
  return { ok: true, evento: Object.assign({}, ev, { autoItens: autoItens_(ev) }),
    participantes: lerLinhas_('Participantes').filter(p => p.eventoId === ev.id),
    respostas: lerLinhas_('Respostas').filter(r => r.eventoId === ev.id) };
}

function acaoBanco_(req, quem) {
  const ev = lerEvento_(req.eventoId);
  if (!podeVer_(ev, quem.email)) return { ok: false, erro: 'sem_permissao' };
  return { ok: true, evento: Object.assign({}, ev, { autoItens: autoItens_(ev) }), questoes: lerLinhas_('Banco').filter(q => q.eventoId === ev.id)
    .map(q => Object.assign(q, { alternativas: parseJson_(q.alternativas, []) })) };
}

function acaoSalvarQuestoes_(req, quem) {
  const ev = lerEvento_(req.eventoId);
  if (!podeVer_(ev, quem.email)) return { ok: false, erro: 'sem_permissao' };
  const lista = Array.isArray(req.questoes) ? req.questoes.slice(0, 30) : [];
  return comTrava_(() => {
    const ids = [];
    lista.forEach(q => {
      const id = 'Q' + Utilities.getUuid().slice(0, 8).toUpperCase();
      anexar_('Banco', { id, criadoEm: new Date(), assunto: limpa_(q.assunto, 200), conceito: Number(q.conceito) || 0,
        conceitoNome: limpa_(q.conceitoNome, 300), nivel: limpa_(q.nivel, 20), uso: limpa_(q.uso, 20),
        pergunta: limpa_(q.pergunta, 2000), alternativas: JSON.stringify((q.alternativas || []).slice(0, 4).map(a => limpa_(a, 600))),
        correta: Number(q.correta) || 0, explicacao: limpa_(q.explicacao, 3000), modelo: limpa_(q.modelo, 100),
        status: 'pendente', editada: 'nao', eventoId: ev.id });
      ids.push(id);
    });
    return { ok: true, ids };
  });
}

function acaoAtualizarQuestao_(req, quem) {
  const q = lerLinhas_('Banco').find(x => x.id === req.id);
  if (!q) return { ok: false, erro: 'nao_encontrada' };
  if (!podeVer_(lerEvento_(q.eventoId), quem.email)) return { ok: false, erro: 'sem_permissao' };
  const mud = {};
  if (req.status && ['pendente', 'aprovada', 'rejeitada'].indexOf(req.status) >= 0) mud.status = req.status;
  if (req.edicao) {
    const e = req.edicao;
    if (e.pergunta != null) mud.pergunta = limpa_(e.pergunta, 2000);
    if (e.alternativas) mud.alternativas = JSON.stringify(e.alternativas.slice(0, 4).map(a => limpa_(a, 600)));
    if (e.correta != null) mud.correta = Number(e.correta);
    if (e.explicacao != null) mud.explicacao = limpa_(e.explicacao, 3000);
    mud.editada = 'sim'; // transparência: registra que houve edição humana
  }
  comTrava_(() => atualizarLinhas_('Banco', x => x.id === req.id, mud));
  limparCacheEvento_(q.eventoId);
  return { ok: true };
}

function acaoTrocarSenha_(req, quem) {
  const adm = lerLinhas_('Admins').find(a => a.email === quem.email);
  if (hash_(adm.sal + String(req.senhaAtual || '')) !== adm.hash) return { ok: false, erro: 'senha_atual_incorreta' };
  if (String(req.novaSenha || '').length < 8) return { ok: false, erro: 'senha_curta' };
  comTrava_(() => salvarAdmin_(quem.email, req.novaSenha));
  return { ok: true };
}

// ── Ações do dono (gestão de administradores) ───────────────────────────────
function acaoAdmins_() {
  return { ok: true, admins: lerLinhas_('Admins').map(a => ({ email: a.email, papel: a.papel, criadoEm: a.criadoEm })) };
}

function acaoCriarAdmin_(req) {
  const email = String(req.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: 'email_invalido' };
  if (String(req.senha || '').length < 8) return { ok: false, erro: 'senha_curta' };
  return comTrava_(() => {
    if (lerLinhas_('Admins').some(a => a.email === email)) return { ok: false, erro: 'ja_existe' };
    salvarAdmin_(email, req.senha, 'admin');
    return { ok: true };
  });
}

function acaoRemoverAdmin_(req, quem) {
  const email = String(req.email || '').trim().toLowerCase();
  if (email === quem.email) return { ok: false, erro: 'nao_pode_remover_a_si' };
  return comTrava_(() => {
    const sh = aba_('Admins'), dados = sh.getDataRange().getValues(), iEmail = dados[0].indexOf('email');
    for (let i = dados.length - 1; i >= 1; i--) if (dados[i][iEmail] === email) { sh.deleteRow(i + 1); return { ok: true }; }
    return { ok: false, erro: 'nao_encontrado' };
  });
}

function acaoRedefinirSenha_(req) {
  const email = String(req.email || '').trim().toLowerCase();
  if (String(req.senha || '').length < 8) return { ok: false, erro: 'senha_curta' };
  return comTrava_(() => {
    if (!lerLinhas_('Admins').some(a => a.email === email)) return { ok: false, erro: 'nao_encontrado' };
    salvarAdmin_(email, req.senha); // também invalida as sessões abertas dessa pessoa
    return { ok: true };
  });
}

// ── Utilitários ─────────────────────────────────────────────────────────────
function aba_(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nome);
  if (!sh) { prepararAbasSilencioso_(); sh = ss.getSheetByName(nome); }
  return sh;
}

function lerLinhas_(nome) {
  const valores = aba_(nome).getDataRange().getValues();
  if (valores.length < 2) return [];
  const cab = valores[0];
  return valores.slice(1).map(l => {
    const o = {};
    cab.forEach((c, i) => { if (c) o[c] = l[i] instanceof Date ? l[i].toISOString() : l[i]; });
    return o;
  });
}

// Grava pela ordem real do cabeçalho da planilha (funciona mesmo com colunas acrescentadas)
function anexar_(nome, obj) {
  const sh = aba_(nome);
  const cab = sh.getDataRange().getValues()[0];
  sh.appendRow(cab.map(c => (obj[c] === undefined ? '' : obj[c])));
}

function atualizarLinhas_(nome, filtro, mudancas) {
  const sh = aba_(nome), dados = sh.getDataRange().getValues(), cab = dados[0];
  let n = 0;
  for (let i = 1; i < dados.length; i++) {
    const o = {}; cab.forEach((c, k) => { o[c] = dados[i][k] instanceof Date ? dados[i][k].toISOString() : dados[i][k]; });
    if (!filtro(o)) continue;
    Object.keys(mudancas).forEach(k => { const col = cab.indexOf(k); if (col >= 0) sh.getRange(i + 1, col + 1).setValue(mudancas[k]); });
    n++;
  }
  return n;
}

function comTrava_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function hash_(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function limpa_(v, max) {
  // Evita fórmulas injetadas na planilha e limita o tamanho
  let s = String(v == null ? '' : v).slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function parseJson_(s, padrao) { try { return JSON.parse(s); } catch (e) { return padrao; } }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
