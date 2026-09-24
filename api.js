/**
 * Operamind — cliente da planilha (Google Apps Script)
 *
 * Envia como text/plain para evitar a checagem prévia de CORS, que o Apps Script
 * não suporta. Pedidos que falham ficam numa fila no aparelho e são reenviados
 * automaticamente, então nenhuma resposta do aluno se perde se a rede oscilar.
 */
const API = (() => {
  const FILA = 'operamind_fila_envio';
  const url = () => (window.OPERAMIND_CONFIG || {}).API_URL || '';

  function configurado() { return !!url(); }

  async function chamar(acao, dados = {}, tentativas = 3) {
    if (!configurado()) throw new Error('API_URL não configurada em config.js');
    let ultimoErro;
    for (let i = 0; i < tentativas; i++) {
      try {
        const r = await fetch(url(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ acao }, dados)),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        return j;
      } catch (e) {
        ultimoErro = e;
        await new Promise(res => setTimeout(res, 600 * (i + 1) + Math.random() * 400));
      }
    }
    throw ultimoErro;
  }

  // ── Fila de envio (para dados dos alunos) ──
  function lerFila() { try { return JSON.parse(localStorage.getItem(FILA) || '[]'); } catch { return []; } }
  function gravarFila(f) { try { localStorage.setItem(FILA, JSON.stringify(f)); } catch {} }

  /** Envia garantindo entrega: se falhar, guarda e tenta de novo depois. */
  async function enviarGarantido(acao, dados) {
    const item = { acao, dados, id: Date.now() + '-' + Math.random().toString(36).slice(2, 7) };
    const fila = lerFila(); fila.push(item); gravarFila(fila);
    await processarFila();
  }

  let processando = false;
  async function processarFila() {
    if (processando || !configurado()) return;
    processando = true;
    try {
      let fila = lerFila();
      while (fila.length) {
        const item = fila[0];
        try {
          const r = await chamar(item.acao, item.dados, 2);
          // Erros definitivos (ex.: evento fechado) não devem travar a fila para sempre
          if (!r.ok && !['evento_fechado', 'codigo_invalido', 'nao_encontrado'].includes(r.erro)) break;
        } catch { break; }
        fila = lerFila().filter(x => x.id !== item.id);
        gravarFila(fila);
      }
    } finally { processando = false; }
  }

  function pendentes() { return lerFila().length; }

  // Tenta de novo periodicamente e quando a conexão volta
  window.addEventListener('online', processarFila);
  setInterval(processarFila, 8000);

  return { configurado, chamar, enviarGarantido, processarFila, pendentes };
})();
