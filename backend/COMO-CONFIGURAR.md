# Como conectar o Operamind à planilha do Google

Leva cerca de 5 minutos e só precisa ser feito uma vez.

## 1. Criar a planilha

1. Acesse https://sheets.new (cria uma planilha nova na sua conta Google).
2. Dê um nome, por exemplo **Operamind — Dados**.

## 2. Colar o código do servidor

1. Na planilha, abra **Extensões → Apps Script**.
2. Apague todo o conteúdo que aparecer e cole o conteúdo do arquivo `backend/Code.gs` deste repositório.
3. Clique em **Salvar** (ícone de disquete).

## 3. Preparar as abas e definir o administrador

1. Volte para a aba da planilha e **recarregue a página** (F5). Vai aparecer um menu novo chamado **Operamind**.
2. Clique em **Operamind → 1. Preparar abas**.
   - O Google vai pedir autorização. Escolha sua conta. Se aparecer "O Google não verificou este app", clique em **Avançado → Acessar (não seguro)**. É normal: o "app" é o seu próprio script.
3. Clique em **Operamind → 2. Definir e-mail e senha do administrador**.
   - Use o e-mail `soaresgahbriel@gmail.com` e uma senha forte (mínimo 8 caracteres).
   - A senha fica guardada apenas como código embaralhado (hash). **Não envie a senha para ninguém, nem no chat.**

## 4. Publicar como App da Web

1. No Apps Script, clique em **Implantar → Nova implantação**.
2. Na engrenagem ao lado de "Selecionar tipo", escolha **App da Web**.
3. Configure:
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa
4. Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).

> "Qualquer pessoa" permite que os alunos enviem respostas sem login. Eles **não** conseguem ver a planilha: só o que o código permite (cadastrar, responder). Os dados só podem ser lidos com o seu login de administrador.

## 5. Conectar o site

Cole a URL em `config.js`:

```js
window.OPERAMIND_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/..../exec',
};
```

(Ou envie a URL para quem está ajudando no código: ela não é secreta.)

## Quando o código do servidor mudar

Cole o novo `Code.gs` no Apps Script, salve e vá em **Implantar → Gerenciar implantações → ✏️ Editar → Versão: Nova versão → Implantar**. A URL continua a mesma.

## Antes da aula (checklist)

- [ ] Área do Pesquisador → Banco de Questões → gerar e **aprovar** as 18 posições (o contador mostra "18/18 pronto").
- [ ] "Testar como aluno" (modo teste, não grava nada) e percorrer as 9 questões.
- [ ] Ensaiar com 2 ou 3 pessoas reais, cronometrando.
- [ ] No início da atividade: **Abrir evento**. Ao final: **Encerrar evento**.
- [ ] Depois da aula: baixar os CSVs em "Dados do Evento" (backup).
