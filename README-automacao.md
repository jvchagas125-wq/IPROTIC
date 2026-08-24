# IPROTIC — Abertura em massa de chamados no ServiceNow

Este pacote atualiza o site para, ao clicar em **Enviar Chamados**, abrir
uma aba do navegador para cada e-mail informado, apontando para o item de
catálogo "Registro de Proatividade" no ServiceNow, com os dados do
formulário passados na própria URL. Um userscript instalado no Chrome lê
esses dados e preenche o formulário automaticamente em cada aba.

## Arquivos deste pacote

- `index.html`, `style.css`, `script.js` — site atualizado (substitua os
  três arquivos originais por estes).
- `iprotic-servicenow-autofill.user.js` — userscript de auto-preenchimento,
  instalado uma única vez no Chrome do analista.

## Passo 1 — Instalar o Tampermonkey

1. Instale a extensão **Tampermonkey** na Chrome Web Store.
2. Clique no ícone do Tampermonkey → **Criar novo script**.
3. Apague o conteúdo padrão e cole todo o conteúdo do arquivo
   `iprotic-servicenow-autofill.user.js`.
4. Salve (Ctrl+S / ícone de disquete).

## Passo 2 — Permitir pop-ups para o site do IPROTIC

Como o clique em "Enviar Chamados" abre várias abas de uma vez, o Chrome
tende a bloquear a maioria delas como pop-up. Antes de usar:

1. Abra o site do IPROTIC no Chrome.
2. Clique no ícone de bloqueio de pop-up na barra de endereço (ou acesse
   `chrome://settings/content/popups`) e adicione o endereço do site à
   lista de permitidos.

Se ainda assim alguma aba for bloqueada, o site mostra um aviso com um
botão **"Reabrir abas bloqueadas"** — clique nele para tentar novamente.

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

## Fluxo resumido

1. Analista preenche o formulário no site do IPROTIC e clica em
   **Enviar Chamados**.
2. O site abre uma aba por e-mail, cada uma com os dados na URL.
3. O userscript, em cada aba, preenche o formulário do ServiceNow.
4. O analista revisa e clica em enviar em cada aba (ou, com
   `AUTO_SUBMIT = true`, o próprio script envia).
