# IPROTIC — Abertura em massa de chamados no ServiceNow

Este pacote atualiza o site para, ao clicar em **Enviar Chamados**, abrir
uma aba do navegador para cada e-mail informado, apontando para o item de
catálogo "Registro de Proatividade" no ServiceNow, com os dados do
formulário passados na própria URL. Um userscript instalado no navegador
lê esses dados e preenche o formulário automaticamente em cada aba.

Testado para funcionar em **Chrome, Microsoft Edge e Mozilla Firefox** —
o Tampermonkey e o próprio site usam apenas recursos padrão de navegador,
sem nada específico de um só fabricante.

## Arquivos deste pacote

- `index.html`, `style.css`, `script.js` — site atualizado (substitua os
  três arquivos originais por estes).
- `logo-icon.png`, `favicon.png` — **arquivos novos**, gerados a partir da
  logo que você enviou. Precisam ser adicionados ao repositório na raiz
  (mesma pasta do `index.html`) — sem eles, o ícone do topo e o ícone da
  aba do navegador não aparecem.
- `iprotic-servicenow-autofill.user.js` — userscript de auto-preenchimento,
  instalado uma única vez no navegador de cada analista.

## Passo 1 — Instalar o Tampermonkey

O Tampermonkey é uma extensão disponível para Chrome, Edge e Firefox — o
processo de instalação do script é o mesmo nos três:

1. Instale a extensão **Tampermonkey** na loja de extensões do seu
   navegador (Chrome Web Store, Microsoft Edge Add-ons ou Firefox
   Browser Add-ons — busque por "Tampermonkey").
2. Clique no ícone do Tampermonkey → **Criar novo script**.
3. Apague o conteúdo padrão e cole todo o conteúdo do arquivo
   `iprotic-servicenow-autofill.user.js`.
4. Salve (Ctrl+S / ícone de disquete).
5. Repita a instalação em cada navegador que o analista for usar (a
   configuração é por navegador, não é compartilhada entre eles).

## Passo 2 — Permitir pop-ups para o site do IPROTIC

Como o clique em "Enviar Chamados" abre várias abas de uma vez, o
navegador tende a bloquear a maioria delas como pop-up — isso acontece
nos três navegadores, cada um com sua própria tela de permissões:

**Chrome:** clique no ícone de bloqueio de pop-up que aparece na barra de
endereço após o primeiro envio, ou acesse `chrome://settings/content/popups`
e adicione o endereço do site à lista de permitidos.

**Microsoft Edge:** mesmo processo do Chrome, em `edge://settings/content/popups`.

**Firefox:** na notificação amarela "Firefox impediu que este site abrisse
uma janela pop-up" (aparece no topo da página), clique em **Preferências**
→ **Permitir para [site]**. Ou acesse `about:preferences#privacy` →
seção Permissões → **Bloquear janelas pop-up** → botão **Exceções** →
adicione o endereço do site.

Se ainda assim alguma aba for bloqueada, o site mostra um aviso com um
botão **"Reabrir abas bloqueadas"** — clique nele para tentar novamente
(esse clique conta como uma nova ação do analista, então costuma passar
pelo bloqueio).

## Passo 3 — Confirmar os nomes dos campos no ServiceNow

Não temos acesso direto à instância do ServiceNow da Petrobras para
inspecionar os campos reais do formulário de catálogo. O userscript
localiza os campos **pelo texto do rótulo** (label), usando estes
palpites iniciais (editáveis no topo do arquivo, em `FIELD_LABELS`):

| Campo do IPROTIC   | Texto de rótulo procurado no ServiceNow                  |
|---------------------|-----------------------------------------------------------|
| E-mail do usuário    | "solicitado para", "e-mail do usuário", "requested for"   |
| Tipo de atendimento  | "tipo de atendimento"                                     |
| Info. adicionais     | "descrição", "observações", "informações adicionais"      |

Antes de usar em produção:

1. Abra manualmente o link do item de catálogo no ServiceNow.
2. Clique com o botão direito sobre cada campo do formulário →
   **Inspecionar** → confira o texto do `<label>` associado.
3. Se o texto real for diferente do que está em `FIELD_LABELS`, edite o
   userscript (Tampermonkey → editar script) e ajuste as listas.
4. Envie um teste com **um único e-mail** e confira visualmente se todos
   os campos foram preenchidos corretamente antes de usar em lote.

O campo de solicitante costuma ser um campo de referência (autocomplete):
o script digita o e-mail e tenta clicar na primeira sugestão que aparece.
Esse é o ponto mais sensível a variações da interface do ServiceNow — se
não funcionar, ajuste `REFERENCE_SUGGESTION_SELECTOR` no topo do
userscript (inspecione a lista de sugestões que aparece ao digitar
manualmente no campo, e copie o seletor CSS do item da lista).

## Passo 4 — Auto-envio (opcional, use com cautela)

Por padrão, o userscript **não** clica automaticamente no botão de
enviar do ServiceNow (`AUTO_SUBMIT = false`) — os campos ficam
preenchidos, mas o analista revisa e confirma manualmente em cada aba.
Depois de validar que o preenchimento está correto para todos os campos,
você pode mudar `AUTO_SUBMIT` para `true` no userscript para que o
próprio chamado seja enviado sem intervenção manual em cada aba.

Recomendação: mantenha `AUTO_SUBMIT = false` até ter certeza de que os
seletores estão corretos — um clique automático em um campo mal
identificado pode enviar um chamado com dados incorretos.

## Passo 5 — Alternativas caso o Tampermonkey esteja bloqueado pelo TI

Em máquinas corporativas (imagem Petrobras), o administrador pode bloquear
a instalação de extensões de navegador — nesse caso o Tampermonkey não
pode ser instalado. Há duas alternativas, sem precisar de extensão:

### Opção A — Bookmarklet (favorito especial), preenchimento manual por aba

- Arquivo: `bookmarklet.html` (página de instalação já publicada no site,
  acessível pelo menu ☰ → Avisos → link "alternativa em favorito").
- Funciona arrastando um link para a barra de favoritos do navegador; ao
  clicar nesse favorito dentro de uma aba do ServiceNow já aberta pelo
  IPROTIC, ele preenche o formulário daquela aba.
- Não precisa instalar nada, mas ainda exige um clique manual no favorito
  em cada aba aberta (não é 100% automático).

### Opção B — Script Python (`automacao_iprotic.py`), 100% automático

- Arquivo: `automacao_iprotic.py` (novo neste pacote).
- Usa a biblioteca **Playwright** para controlar o navegador diretamente
  pelo protocolo de automação — não é uma extensão, então não esbarra no
  bloqueio de instalação de extensões do TI.
- Abre e preenche **todas** as abas sozinho, sem clique manual por aba
  (só a confirmação final de envio, que continua manual por padrão).

**Como usar:**

1. No site, preencha o formulário normalmente e, em vez de (ou além de)
   "Enviar Chamados", clique em **"Baixar dados (Python)"**. Isso baixa um
   arquivo `iprotic-chamados.json` com os dados de todos os e-mails.
2. Instale as dependências uma única vez (requer Python 3 instalado na
   máquina):
   ```
   pip install playwright
   playwright install chromium
   ```
3. Rode o script apontando para o arquivo baixado:
   ```
   python automacao_iprotic.py Downloads\iprotic-chamados.json
   ```
4. Na primeira execução, uma janela do navegador abre para você fazer
   login no ServiceNow (SSO da Petrobras) normalmente. Depois de logado,
   volte ao terminal e pressione ENTER — o script reaproveita essa sessão
   salva localmente nas próximas execuções, sem pedir login de novo
   enquanto ela não expirar.
5. O script abre uma aba por e-mail e preenche os campos automaticamente.
   Revise cada uma e clique em enviar manualmente (ou ajuste
   `AUTO_SUBMIT = True` no topo do script depois de validar visualmente
   que o preenchimento está correto — mesma recomendação de cautela do
   Passo 4).

Assim como o userscript e o bookmarklet, os textos de rótulo usados para
encontrar os campos (`FIELD_LABELS`, no topo do script) são palpites —
confirme/ajuste com um teste de um único e-mail antes de usar em lote.

## Fluxo resumido

1. Analista preenche o formulário no site do IPROTIC e clica em
   **Enviar Chamados** (ou, sem Tampermonkey/extensão, em **"Baixar dados
   (Python)"** e roda `automacao_iprotic.py`).
2. O site abre uma aba por e-mail, cada uma com os dados na URL (ou o
   script Python abre e preenche cada aba sozinho).
3. O userscript (ou o bookmarklet, ou o script Python), em cada aba,
   preenche o formulário do ServiceNow.
4. O analista revisa e clica em enviar em cada aba (ou, com
   `AUTO_SUBMIT = true`, o próprio script/userscript envia).
