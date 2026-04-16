/**
 * BloomAI — Adaptive Learning Engine
 *
 * Implements:
 *   1. Bloom's Revised Taxonomy level management
 *   2. Regression / progression state machine
 *   3. Simplified Bayesian Knowledge Tracing (BKT)
 *   4. Few-shot prompt engineering for the Anthropic API
 */

// ── Bloom Taxonomy Config ────────────────────────────────────────────────────
const BLOOM = {
  levels: ['Lembrar', 'Entender', 'Aplicar', 'Analisar', 'Avaliar', 'Criar'],

  // Verbos-chave de Krathwohl (2002) por nível
  verbs: {
    'Lembrar':  ['liste', 'reconheça', 'identifique', 'nomeie', 'cite'],
    'Entender': ['explique', 'resuma', 'classifique', 'descreva', 'interprete'],
    'Aplicar':  ['use', 'demonstre', 'resolva', 'aplique', 'execute'],
    'Analisar': ['compare', 'diferencie', 'organize', 'examine', 'questione'],
    'Avaliar':  ['julgue', 'justifique', 'critique', 'avalie', 'defenda'],
    'Criar':    ['projete', 'formule', 'construa', 'elabore', 'proponha'],
  },

  // Colors for UI badges
  colors: {
    'Lembrar':  { bg: '#1e1b4b', text: '#818cf8', border: '#3730a3' },
    'Entender': { bg: '#1e3a5f', text: '#60a5fa', border: '#1d4ed8' },
    'Aplicar':  { bg: '#14532d', text: '#4ade80', border: '#15803d' },
    'Analisar': { bg: '#422006', text: '#fb923c', border: '#c2410c' },
    'Avaliar':  { bg: '#4a1942', text: '#e879f9', border: '#a21caf' },
    'Criar':    { bg: '#3d1a00', text: '#fbbf24', border: '#d97706' },
  },

  // Index helpers
  indexOf(level) { return this.levels.indexOf(level); },
  fromIndex(i)   { return this.levels[Math.max(0, Math.min(5, i))]; },
  getVerbs(level){ return this.verbs[level] || this.verbs['Lembrar']; },
};

// ── BKT (Bayesian Knowledge Tracing) ────────────────────────────────────────
// Simplified 4-parameter model: pL0, pT, pS, pG
class BKT {
  constructor() {
    this.pL  = 0.3;  // initial knowledge probability
    this.pT  = 0.15; // transition (learn) probability
    this.pS  = 0.1;  // slip (know but wrong)
    this.pG  = 0.2;  // guess (don't know but right)
  }

  // Update pL after an observed response
  update(correct) {
    const pObs = correct
      ? this.pL * (1 - this.pS) + (1 - this.pL) * this.pG
      : this.pL * this.pS       + (1 - this.pL) * (1 - this.pG);

    // Posterior
    const pLgivenObs = correct
      ? (this.pL * (1 - this.pS)) / pObs
      : (this.pL * this.pS)       / pObs;

    // Transition
    this.pL = pLgivenObs + (1 - pLgivenObs) * this.pT;
    return this.pL;
  }

  get value() { return Math.round(this.pL * 100); }
}

// ── Adaptive State Machine ───────────────────────────────────────────────────
class AdaptiveEngine {
  constructor(startBloomIndex = 2) { // default N0 = "Aplicar" (mid-level)
    this.bloomIndex    = startBloomIndex; // 0=Lembrar … 5=Criar
    this.consecutiveOk = 0;
    this.bkt           = new BKT();
    this.attempts      = [];             // full history for this session
    this.needRemediation = false;
  }

  get currentLevel()  { return BLOOM.fromIndex(this.bloomIndex); }
  get bktValue()      { return this.bkt.value; }

  // Called after user answers; returns { regressed, progressed, remediation }
  recordAnswer(correct) {
    const level = this.currentLevel;
    this.bkt.update(correct);
    this.attempts.push({ level: this.bloomIndex, bloomLevel: level, correct, ts: Date.now() });

    if (correct) {
      this.consecutiveOk++;
      this.needRemediation = false;
      if (this.consecutiveOk >= 3 && this.bloomIndex < 5) {
        this.bloomIndex++;
        this.consecutiveOk = 0;
        return { progressed: true, regressed: false, remediation: false };
      }
      return { progressed: false, regressed: false, remediation: false };

    } else {
      this.consecutiveOk = 0;
      if (this.bloomIndex > 0) {
        this.bloomIndex--;
        return { progressed: false, regressed: true, remediation: false };
      } else {
        // Already at minimum — trigger remediation
        this.needRemediation = true;
        return { progressed: false, regressed: false, remediation: true };
      }
    }
  }

  resetAfterRemediation() {
    this.bloomIndex    = 0;
    this.consecutiveOk = 0;
    this.needRemediation = false;
  }
}

// ── Prompt Engineering ───────────────────────────────────────────────────────
/**
 * Builds the few-shot prompt for question generation.
 *
 * @param {string} topic        - Educational topic
 * @param {string} targetLevel  - Bloom level (e.g. "Aplicar")
 * @param {string|null} prevQuestion - Previous question to regress from (or null)
 * @param {boolean} isRegression     - true if this is a regressed version
 * @returns {string} The full user-turn prompt
 */
function buildPrompt(topic, targetLevel, prevQuestion = null, isRegression = false) {
  const verbs = BLOOM.getVerbs(targetLevel);
  const verbList = verbs.slice(0, 3).join(', ');

  // Few-shot examples: one pair per cognitive transition
  const fewShot = `
=== EXEMPLOS FEW-SHOT ===

TEMA: Fotossíntese
NÍVEL: Aplicar
PERGUNTA: Um estudante precisa calcular a quantidade de glicose produzida por uma planta ao receber 8 horas de luz solar em condições ideais. Qual equação da fotossíntese ele deve usar?
ALTERNATIVA_A (CORRETA): 6CO₂ + 6H₂O + luz → C₆H₁₂O₆ + 6O₂
ALTERNATIVA_B: O₂ + C₆H₁₂O₆ → CO₂ + H₂O + ATP
ALTERNATIVA_C: 2H₂O → 4H⁺ + O₂ + 4e⁻
ALTERNATIVA_D: C₆H₁₂O₆ → 2C₃H₆O₃ + energia
EXPLICACAO: A equação completa da fotossíntese mostra a conversão de CO₂ e H₂O em glicose usando luz.

---

TEMA: Fotossíntese
NÍVEL: Entender (REGRESSÃO de Aplicar)
REFERÊNCIA: Um estudante precisa calcular a quantidade de glicose produzida por uma planta ao receber 8 horas de luz solar em condições ideais. Qual equação da fotossíntese ele deve usar?
PERGUNTA: O que é fotossíntese? Explique em termos simples o que a planta faz durante esse processo.
ALTERNATIVA_A (CORRETA): A planta converte luz solar, água e CO₂ em glicose e oxigênio.
ALTERNATIVA_B: A planta queima oxigênio para produzir energia a partir da glicose.
ALTERNATIVA_C: A planta absorve nitrogênio do solo para produzir proteínas.
ALTERNATIVA_D: A planta transforma água em oxigênio pela respiração noturna.
EXPLICACAO: Fotossíntese é o processo de conversão de energia luminosa em energia química (glicose).

=== FIM DOS EXEMPLOS ===
`.trim();

  const regressionCtx = isRegression && prevQuestion
    ? `\nEsta questão é uma REGRESSÃO. Mantenha o mesmo tema mas reduza a complexidade cognitiva para o nível ${targetLevel}.\nQUESTÃO ANTERIOR (nível superior): ${prevQuestion}\n`
    : '';

  return `
${fewShot}

Você é um especialista em design instrucional e Taxonomia de Bloom Revisada (Krathwohl, 2002).
Sua tarefa é gerar UMA questão de múltipla escolha de alta qualidade.

REGRAS OBRIGATÓRIAS:
1. A questão deve operacionalizar o nível cognitivo "${targetLevel}" usando verbos como: ${verbList}.
2. Gere exatamente 4 alternativas (A, B, C, D). Apenas UMA deve ser correta.
3. As alternativas incorretas devem ser plausíveis (não obviamente erradas).
4. Forneça uma explicação curta da resposta correta.
5. Responda SOMENTE em JSON válido, sem markdown, sem texto extra.
${regressionCtx}

TEMA: ${topic}
NÍVEL BLOOM: ${targetLevel}

Formato de resposta (JSON puro):
{
  "question": "...",
  "options": ["Texto A", "Texto B", "Texto C", "Texto D"],
  "correctIndex": 0,
  "explanation": "...",
  "bloomLevel": "${targetLevel}"
}
`.trim();
}

/**
 * Builds the remediation prompt — returns an explanatory card (not a question).
 */
function buildRemediationPrompt(topic, level) {
  return `
Você é um tutor experiente e empático.
O estudante errou repetidamente questões sobre "${topic}" e precisa de uma explicação clara e acessível sobre o conceito fundamental.

Escreva uma explicação didática curta (3-4 parágrafos) que:
1. Explique o conceito central de forma simples.
2. Use uma analogia do cotidiano.
3. Termine com uma frase motivadora.

Responda SOMENTE em JSON:
{
  "title": "Revisão: ${topic}",
  "body": "... (texto completo, pode incluir \\n para parágrafos)",
  "tip": "Dica prática em 1 frase"
}
`.trim();
}

// Export
window.BLOOM = BLOOM;
window.BKT   = BKT;
window.AdaptiveEngine   = AdaptiveEngine;
window.buildPrompt      = buildPrompt;
window.buildRemediationPrompt = buildRemediationPrompt;
