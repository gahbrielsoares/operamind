# operamind

# BloomAI — Aprendizado Adaptativo com Taxonomia de Bloom

> MVP funcional baseado em: **Soares, G.J.S. (2025)** — *Aprendizado Adaptativo com Grandes Modelos de Linguagem: Uma Abordagem Baseada na Taxonomia de Bloom*

---

## 🗂️ Estrutura de Arquivos

```
bloom-adaptive/
├── index.html       ← Tela de login/cadastro
├── app.html         ← Aplicação principal (questões adaptativas)
├── analytics.html   ← Dashboard público de análise
├── bloom.js         ← Engine adaptativa + BKT + engenharia de prompt
├── db.js            ← Camada de dados (localStorage)
└── README.md
```

---

## ⚡ Como Fazer o Deploy no GitHub Pages

### Passo 1 — Obter a chave da API Anthropic

1. Acesse [console.anthropic.com](https://console.anthropic.com/)
2. Crie uma conta e gere uma **API Key**
3. Abra o arquivo `app.html` em um editor de texto
4. Localize a linha:
   ```javascript
   const ANTHROPIC_API_KEY = 'COLE_SUA_CHAVE_AQUI';
   ```
5. Substitua `COLE_SUA_CHAVE_AQUI` pela sua chave real

> ⚠️ **Aviso de segurança:** A chave ficará exposta no HTML público.
> Para uso acadêmico/demonstração isso é aceitável.
> Para produção, use um backend intermediário.

---

### Passo 2 — Criar repositório no GitHub

1. Acesse [github.com](https://github.com) e faça login
2. Clique em **"New repository"**
3. Dê o nome: `bloom-adaptive` (ou qualquer nome)
4. Marque como **Public**
5. Clique em **"Create repository"**

---

### Passo 3 — Fazer upload dos arquivos

**Opção A — Pela interface web do GitHub (mais fácil):**

1. Na página do repositório, clique em **"uploading an existing file"**
2. Arraste **todos os 5 arquivos** de uma vez:
   - `index.html`
   - `app.html`
   - `analytics.html`
   - `bloom.js`
   - `db.js`
3. Clique em **"Commit changes"**

**Opção B — Via Git (terminal):**

```bash
git init
git add .
git commit -m "feat: BloomAI MVP inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/bloom-adaptive.git
git push -u origin main
```

---

### Passo 4 — Ativar o GitHub Pages

1. No repositório, clique em **Settings** (aba superior)
2. No menu lateral, clique em **Pages**
3. Em **"Branch"**, selecione `main` e pasta `/ (root)`
4. Clique em **Save**
5. Aguarde ~1 minuto
6. O link ficará disponível em:
   ```
   https://SEU_USUARIO.github.io/bloom-adaptive/
   ```

---

## 🎯 Funcionalidades Implementadas

| Módulo | Status | Descrição |
|--------|--------|-----------|
| Login/Cadastro | ✅ | Autenticação simples via localStorage |
| Geração de questões | ✅ | API Anthropic + few-shot prompting |
| Regressão adaptativa | ✅ | N0 → N-5 com máquina de estados |
| Progressão (3 acertos) | ✅ | Avança nível após 3 consecutivos |
| BKT simplificado | ✅ | 4 parâmetros: pL, pT, pS, pG |
| Módulo de remediação | ✅ | Card explicativo ao atingir N-5 |
| Dashboard de progresso | ✅ | Pirâmide visual + indicador BKT |
| Analytics público | ✅ | KPIs, gráficos, tabela por participante |
| Busca por tema | ✅ | Filtra analytics pelo tema digitado |
| Persistência | ✅ | localStorage (sem servidor) |

---

## 🧠 Arquitetura do Sistema

```
Estudante digita tema
       ↓
[Módulo de Geração]
  buildPrompt(topic, bloomLevel, prevQuestion, isRegression)
  → few-shot + verbos Krathwohl → Anthropic API → questão JSON
       ↓
[Componente de Questão]
  Exibe pergunta + 4 alternativas
       ↓
Estudante responde
       ↓
[AdaptiveEngine.recordAnswer(correct)]
  ├─ Correto + streak < 3  → mantém nível
  ├─ Correto + streak = 3  → avança nível (N+1)
  ├─ Errado + nível > 0    → regride (N-1) → nova questão regredida
  └─ Errado + nível = 0    → módulo de remediação
       ↓
[BKT.update(correct)]
  Atualiza probabilidade de domínio do estudante
       ↓
[DB.saveSession()]
  Persiste tentativa no localStorage
```

---

## 📚 Referências

- Krathwohl, D.R. (2002). A revision of Bloom's taxonomy. *Theory into Practice*, 41(4).
- Corbett, A.T. & Anderson, J.R. (1994). Knowledge tracing. *User Modeling*, 4(4).
- Duong-Trung et al. (2024). BloomLLM. *EC-TEL 2024*, LNCS 15160.
- Scaria et al. (2024). Automated Question Generation at Bloom's Levels. *AIED 2024*.
