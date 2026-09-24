/**
 * Operamind — Servidor na Planilha Google (Apps Script)
 *
 * Este arquivo vai DENTRO da planilha: Extensões → Apps Script → cole tudo aqui.
 * Veja o passo a passo em backend/COMO-CONFIGURAR.md.
 *
 * Abas criadas automaticamente:
 *   Participantes  → código anônimo, nível de ensino, área, ordem das formas, consentimento
 *   Respostas      → uma linha por questão respondida (nunca contém nomes)
 *   Banco          → questões geradas pelo Operamind (pendente / aprovada / rejeitada)
 *   Config         → configuração do evento (aberto/fechado, assunto, conceitos)
 *
 * Segurança:
 *   - A senha do administrador é definida pelo menu "Operamind" da planilha e fica
 *     guardada apenas como hash (SHA-256 com sal). Nunca aparece no código.
 *   - Ações administrativas exigem um token temporário (6 h) obtido no login.
 */

// ── Estrutura das abas ──────────────────────────────────────────────────────
const ABAS = {
  Participantes: ['registradoEm', 'codigo', 'nivelEnsino', 'area', 'ordem', 'consentimento',
                  'dispositivo', 'concluidoEm', 'acertosAntes', 'acertosDepois'],
  Respostas:     ['registradoEm', 'codigo', 'fase', 'posicao', 'forma', 'conceito', 'nivel',
                  'questaoId', 'acertou', 'tempoMs', 'origem', 'remediacao', 'nivelDepois'],
  Banco:         ['id', 'criadoEm', 'assunto', 'conceito', 'conceitoNome', 'nivel', 'uso',
                  'pergunta', 'alternativas', 'correta', 'explicacao', 'modelo', 'status', 'editada'],
  Config:        ['chave', 'valor'],
};

const CONFIG_PADRAO = {
  eventoAberto: 'nao',
  eventoId: 'aula-01',
  assunto: 'Como a IA generativa funciona e por que erra',
  // Desenho 2: cada "conceito" é uma dimensão do assunto, alinhada a um nível de Bloom
  conceito1: 'O que é a IA generativa',
  conceito2: 'Como a IA generativa funciona e por que ela erra',
  conceito3: 'Como usar a IA generativa de forma crítica no dia a dia',
  // Autoavaliação (Blocos 1 e 3 usam exatamente o mesmo texto)
  auto1: 'Você sabe o que é IA generativa?',
  auto2: 'Você compreende como a IA generativa funciona, ou seja, como ela produz uma resposta?',
  auto3: 'Você sabe aplicar esse conhecimento, por exemplo, para perceber quando a IA está errando?',
};
const VERSAO_DESENHO = '2';

// ── Menu da planilha ────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Operamind')
    .addItem('1. Preparar abas', 'prepararAbas')
    .addItem('2. Definir e-mail e senha do administrador', 'definirAdmin')
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
      sh.getRange(1, 1, 1, ABAS[nome].length).setFontWeight('bold');
    }
  });
  const cfg = lerConfig_();
  Object.keys(CONFIG_PADRAO).forEach(k => { if (cfg[k] === undefined) gravarConfig_(k, CONFIG_PADRAO[k]); });
  try { SpreadsheetApp.getUi().alert('Abas prontas.'); } catch (e) {}
}

function definirAdmin() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt('E-mail do administrador', 'Digite o e-mail usado para entrar na Área do Pesquisador:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt('Senha do administrador', 'Digite a senha (mínimo 8 caracteres). Ela será guardada apenas como hash:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  const email = r1.getResponseText().trim().toLowerCase();
  const senha = r2.getResponseText();
  if (!email.includes('@') || senha.length < 8) { ui.alert('E-mail inválido ou senha muito curta.'); return; }
  salvarAdmin_(email, senha);
  ui.alert('Administrador definido: ' + email);
}

function salvarAdmin_(email, senha) {
  const sal = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_EMAIL: email, ADMIN_SAL: sal, ADMIN_HASH: hash_(sal + senha),
  });
}

// ── Entrada HTTP ────────────────────────────────────────────────────────────
function doGet() {
  return json_({ ok: true, servico: 'operamind', hora: new Date().toISOString() });
}

function doPost(e) {
  try {
    migrar_();
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const acao = req.acao;
    const publico = { evento: acaoEvento_, registrar: acaoRegistrar_, respostas: acaoRespostas_, concluir: acaoConcluir_, login: acaoLogin_ };
    const admin = { dados: acaoDados_, banco: acaoBanco_, salvarQuestoes: acaoSalvarQuestoes_,
                    atualizarQuestao: acaoAtualizarQuestao_, config: acaoConfig_ };
    if (publico[acao]) return json_(publico[acao](req));
    if (admin[acao]) {
      if (!tokenValido_(req.token)) return json_({ ok: false, erro: 'nao_autorizado' });
      return json_(admin[acao](req));
    }
    return json_({ ok: false, erro: 'acao_desconhecida' });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  }
}

// ── Ações públicas (alunos) ─────────────────────────────────────────────────
function acaoEvento_() {
  // Cache curto: 30 alunos abrindo o link ao mesmo tempo não leem a planilha 30 vezes
  const cache = CacheService.getScriptCache();
  const salvo = cache.get('evento_publico');
  if (salvo) return JSON.parse(salvo);
  const cfg = lerConfig_();
  const questoes = lerLinhas_('Banco')
    .filter(q => q.status === 'aprovada' && q.assunto === cfg.assunto && q.conceitoNome === cfg['conceito' + q.conceito])
    .map(q => ({
      id: q.id, conceito: Number(q.conceito), nivel: q.nivel, uso: q.uso,
      pergunta: q.pergunta, alternativas: parseJson_(q.alternativas, []),
      correta: Number(q.correta), explicacao: q.explicacao,
    }));
  const resp = {
    ok: true,
    aberto: cfg.eventoAberto === 'sim',
    eventoId: cfg.eventoId,
    assunto: cfg.assunto,
    conceitos: [cfg.conceito1, cfg.conceito2, cfg.conceito3],
    autoavaliacao: [cfg.auto1, cfg.auto2, cfg.auto3],
    questoes,
  };
  try { cache.put('evento_publico', JSON.stringify(resp), 15); } catch (e) {}
  return resp;
}

function limparCacheEvento_() { CacheService.getScriptCache().remove('evento_publico'); }

function acaoRegistrar_(req) {
  if (lerConfig_().eventoAberto !== 'sim') return { ok: false, erro: 'evento_fechado' };
  const p = req.participante || {};
  if (!/^P-[A-Z0-9]{5}$/.test(p.codigo || '')) return { ok: false, erro: 'codigo_invalido' };
  return comTrava_(() => {
    const existentes = lerLinhas_('Participantes');
    if (existentes.some(x => x.codigo === p.codigo)) return { ok: true, repetido: true };
    const ordem = 'escada'; // desenho 2: autoavaliação → escada adaptativa → autoavaliação
    anexar_('Participantes', {
      registradoEm: new Date(), codigo: p.codigo, nivelEnsino: limpa_(p.nivelEnsino, 60),
      area: limpa_(p.area, 80), ordem,
      consentimento: 'sim', dispositivo: limpa_(p.dispositivo, 20),
    });
    return { ok: true };
  });
}

function acaoRespostas_(req) {
  const codigo = req.codigo || '';
  if (!/^P-[A-Z0-9]{5}$/.test(codigo)) return { ok: false, erro: 'codigo_invalido' };
  const lista = Array.isArray(req.respostas) ? req.respostas.slice(0, 20) : [];
  return comTrava_(() => {
    const ja = new Set(lerLinhas_('Respostas').filter(r => r.codigo === codigo).map(r => r.fase + '#' + r.posicao));
    let n = 0;
    lista.forEach(r => {
      const chave = r.fase + '#' + r.posicao;
      if (ja.has(chave)) return; // reenvio: ignora duplicata
      anexar_('Respostas', {
        registradoEm: new Date(), codigo, fase: limpa_(r.fase, 20), posicao: Number(r.posicao) || 0,
        forma: limpa_(r.forma, 10), conceito: Number(r.conceito) || 0, nivel: limpa_(r.nivel, 20),
        questaoId: limpa_(r.questaoId, 40), acertou: r.acertou ? 1 : 0, tempoMs: Number(r.tempoMs) || 0,
        origem: limpa_(r.origem, 30), remediacao: r.remediacao ? 1 : 0, nivelDepois: limpa_(r.nivelDepois, 20),
      });
      ja.add(chave); n++;
    });
    return { ok: true, gravadas: n };
  });
}

function acaoConcluir_(req) {
  const codigo = req.codigo || '';
  return comTrava_(() => {
    const sh = aba_('Participantes');
    const dados = sh.getDataRange().getValues();
    const cab = dados[0];
    const iCod = cab.indexOf('codigo');
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][iCod] === codigo) {
        sh.getRange(i + 1, cab.indexOf('concluidoEm') + 1).setValue(new Date());
        sh.getRange(i + 1, cab.indexOf('acertosAntes') + 1).setValue(Number(req.antes) || 0);
        sh.getRange(i + 1, cab.indexOf('acertosDepois') + 1).setValue(Number(req.depois) || 0);
        return { ok: true };
      }
    }
    return { ok: false, erro: 'nao_encontrado' };
  });
}

function acaoLogin_(req) {
  const cache = CacheService.getScriptCache();
  const tentativas = Number(cache.get('login_falhas') || 0);
  if (tentativas >= 10) return { ok: false, erro: 'muitas_tentativas' };
  const props = PropertiesService.getScriptProperties().getProperties();
  if (!props.ADMIN_HASH) return { ok: false, erro: 'admin_nao_configurado' };
  const email = String(req.email || '').trim().toLowerCase();
  const ok = email === props.ADMIN_EMAIL && hash_(props.ADMIN_SAL + String(req.senha || '')) === props.ADMIN_HASH;
  if (!ok) {
    cache.put('login_falhas', String(tentativas + 1), 900); // bloqueia 15 min após 10 erros
    Utilities.sleep(700);
    return { ok: false, erro: 'credenciais_invalidas' };
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('tok_' + token, email, 21600); // 6 horas
  return { ok: true, token, email, planilha: SpreadsheetApp.getActiveSpreadsheet().getUrl() };
}

// ── Ações administrativas ───────────────────────────────────────────────────
function acaoDados_() {
  return { ok: true, participantes: lerLinhas_('Participantes'), respostas: lerLinhas_('Respostas'), config: lerConfig_() };
}

function acaoBanco_() {
  return { ok: true, questoes: lerLinhas_('Banco').map(q => Object.assign(q, { alternativas: parseJson_(q.alternativas, []) })), config: lerConfig_() };
}

function acaoSalvarQuestoes_(req) {
  const lista = Array.isArray(req.questoes) ? req.questoes.slice(0, 30) : [];
  return comTrava_(() => {
    const ids = [];
    lista.forEach(q => {
      const id = 'Q' + Utilities.getUuid().slice(0, 8).toUpperCase();
      anexar_('Banco', {
        id, criadoEm: new Date(), assunto: limpa_(q.assunto, 200), conceito: Number(q.conceito) || 0,
        conceitoNome: limpa_(q.conceitoNome, 200), nivel: limpa_(q.nivel, 20), uso: limpa_(q.uso, 20),
        pergunta: limpa_(q.pergunta, 2000), alternativas: JSON.stringify((q.alternativas || []).slice(0, 4).map(a => limpa_(a, 600))),
        correta: Number(q.correta) || 0, explicacao: limpa_(q.explicacao, 3000), modelo: limpa_(q.modelo, 100),
        status: 'pendente', editada: 'nao',
      });
      ids.push(id);
    });
    return { ok: true, ids };
  });
}

function acaoAtualizarQuestao_(req) {
  return comTrava_(() => {
    const sh = aba_('Banco');
    const dados = sh.getDataRange().getValues();
    const cab = dados[0];
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] !== req.id) continue;
      const set = (campo, valor) => sh.getRange(i + 1, cab.indexOf(campo) + 1).setValue(valor);
      if (req.status && ['pendente', 'aprovada', 'rejeitada'].includes(req.status)) set('status', req.status);
      if (req.edicao) {
        const e = req.edicao;
        if (e.pergunta != null) set('pergunta', limpa_(e.pergunta, 2000));
        if (e.alternativas) set('alternativas', JSON.stringify(e.alternativas.slice(0, 4).map(a => limpa_(a, 600))));
        if (e.correta != null) set('correta', Number(e.correta));
        if (e.explicacao != null) set('explicacao', limpa_(e.explicacao, 3000));
        set('editada', 'sim'); // transparência: registra que houve edição humana
      }
      limparCacheEvento_();
      return { ok: true };
    }
    return { ok: false, erro: 'nao_encontrada' };
  });
}

function acaoConfig_(req) {
  const permitidas = Object.keys(CONFIG_PADRAO);
  const mud = req.mudancas || {};
  comTrava_(() => Object.keys(mud).forEach(k => { if (permitidas.includes(k)) gravarConfig_(k, limpa_(mud[k], 200)); }));
  limparCacheEvento_();
  return { ok: true, config: lerConfig_() };
}

// Atualiza a configuração salva para o desenho atual (roda uma única vez)
function migrar_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DESENHO') === VERSAO_DESENHO) return;
  comTrava_(() => {
    ['conceito1', 'conceito2', 'conceito3', 'auto1', 'auto2', 'auto3'].forEach(k => gravarConfig_(k, CONFIG_PADRAO[k]));
  });
  props.setProperty('DESENHO', VERSAO_DESENHO);
  limparCacheEvento_();
}

// ── Utilitários ─────────────────────────────────────────────────────────────
function aba_(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nome);
  if (!sh) { prepararAbas(); sh = ss.getSheetByName(nome); }
  return sh;
}

function lerLinhas_(nome) {
  const valores = aba_(nome).getDataRange().getValues();
  if (valores.length < 2) return [];
  const cab = valores[0];
  return valores.slice(1).map(l => {
    const o = {};
    cab.forEach((c, i) => { o[c] = l[i] instanceof Date ? l[i].toISOString() : l[i]; });
    return o;
  });
}

function anexar_(nome, obj) {
  aba_(nome).appendRow(ABAS[nome].map(c => (obj[c] === undefined ? '' : obj[c])));
}

function lerConfig_() {
  const cfg = Object.assign({}, CONFIG_PADRAO);
  lerLinhas_('Config').forEach(l => { if (l.chave) cfg[l.chave] = String(l.valor); });
  return cfg;
}

function gravarConfig_(chave, valor) {
  const sh = aba_('Config');
  const dados = sh.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === chave) { sh.getRange(i + 1, 2).setValue(valor); return; }
  }
  sh.appendRow([chave, valor]);
}

function comTrava_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function tokenValido_(token) {
  return !!token && !!CacheService.getScriptCache().get('tok_' + token);
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
