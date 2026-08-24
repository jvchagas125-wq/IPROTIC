/* ============================================================
   IPROTIC — Abertura de Chamados ServiceNow
   script.js
   Minsait · Grupo Indra
   ============================================================ */

/* ──────────────────────────────────────────────────────────
   CONSTANTES — valores fixos do fluxo de automação
   Estes valores refletem exatamente os parâmetros do
   catálogo de serviços no ServiceNow.
────────────────────────────────────────────────────────── */
const AUTOMATION_DEFAULTS = {
  o_que_deseja:   'Registros de Proatividade',
  mesa_responsavel: 'N1-SD_PADRAO'
};

/* Link do item de catálogo no ServiceNow (Registro de Proatividade).
   Cada aba aberta usa esse link como base, acrescentando os dados
   do chamado como parâmetros de URL (lidos pelo userscript de
   auto-preenchimento — veja README-automacao.md). */
const SERVICENOW_CATALOG_URL =
  'https://petrobras.service-now.com/cs?id=sc_cat_item&sys_id=26e4bc991ba9c2d8feb132681b4bcb84&table=sc_cat_item&searchTerm=registro%20de%20proatividade';

/* As abas são abertas de forma SÍNCRONA (sem setTimeout/delay) de
   propósito: no Firefox, qualquer chamada a window.open() feita
   fora da pilha de execução direta do clique (mesmo com um
   setTimeout de 0ms) deixa de ser tratada como "iniciada pelo
   usuário" e é bloqueada de forma ainda mais agressiva do que no
   Chrome/Edge. Abrir tudo em um laço síncrono, dentro do próprio
   handler de clique, é o que funciona de forma mais consistente
   nos três navegadores — mesmo assim, abrir muitas abas de uma vez
   pode ser bloqueado, por isso é essencial permitir pop-ups para
   este site (ver banner de aviso na página). */

/* ──────────────────────────────────────────────────────────
   INICIALIZAÇÃO
────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initRadioOptions();
  initModeTabs();
  initEmailCounter();
  initFileUpload();
  initPreview();
  initSubmit();
  initRetryBlocked();
  initDownloadJson();
});

/* ──────────────────────────────────────────────────────────
   RADIO OPTIONS — destaca a opção selecionada
────────────────────────────────────────────────────────── */
function initRadioOptions() {
  document.querySelectorAll('.radio-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input[type="radio"]').checked = true;
    });
  });
}

/* ──────────────────────────────────────────────────────────
   ABAS DE MODO DE INSERÇÃO DE E-MAILS
────────────────────────────────────────────────────────── */
function initModeTabs() {
  const tabs = document.querySelectorAll('.mode-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      document.getElementById('mode-manual').style.display = mode === 'manual' ? '' : 'none';
      document.getElementById('mode-upload').style.display = mode === 'upload'  ? '' : 'none';
    });
  });
}

/* ──────────────────────────────────────────────────────────
   CONTADOR DE E-MAILS
────────────────────────────────────────────────────────── */
function initEmailCounter() {
  const textarea      = document.getElementById('email-manual');
  const countLabel    = document.getElementById('email-count-label');
  const clearBtn      = document.getElementById('email-clear-btn');
  const submitCount   = document.getElementById('submit-count');

  textarea.addEventListener('input', () => {
    const emails = parseEmails(textarea.value);
    const n = emails.length;
    countLabel.textContent = n === 0
      ? '0 e-mails inseridos'
      : `${n} e-mail${n > 1 ? 's' : ''} inserido${n > 1 ? 's' : ''}`;
    countLabel.classList.toggle('has-emails', n > 0);
    clearBtn.classList.toggle('visible', n > 0);
    submitCount.innerHTML = n > 0
      ? `cada um dos <strong>${n} e-mail${n > 1 ? 's' : ''}</strong>`
      : 'cada e-mail';
  });

  clearBtn.addEventListener('click', () => {
    textarea.value = '';
    textarea.dispatchEvent(new Event('input'));
  });
}

/* ──────────────────────────────────────────────────────────
   UPLOAD DE ARQUIVO (.txt / .csv)
────────────────────────────────────────────────────────── */
function initFileUpload() {
  const dropArea  = document.getElementById('drop-area');
  const fileInput = document.getElementById('file-input');
  const fileStatus = document.getElementById('file-status');

  ['dragenter', 'dragover'].forEach(evt =>
    dropArea.addEventListener(evt, ev => { ev.preventDefault(); dropArea.classList.add('drag-over'); })
  );
  ['dragleave', 'drop'].forEach(evt =>
    dropArea.addEventListener(evt, ev => { ev.preventDefault(); dropArea.classList.remove('drag-over'); })
  );

  dropArea.addEventListener('drop', ev => {
    const file = ev.dataTransfer.files[0];
    if (file) processFile(file, fileStatus);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) processFile(fileInput.files[0], fileStatus);
  });
}

function processFile(file, statusEl) {
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  const isSpreadsheet = extension === 'xlsx' || extension === 'xls';

  if (isSpreadsheet) {
    processSpreadsheetFile(file, statusEl);
  } else {
    processTextFile(file, statusEl);
  }
}

function processTextFile(file, statusEl) {
  const reader = new FileReader();
  reader.onload = e => {
    const emails = parseEmails(e.target.result);
    reportFileEmails(file, emails, statusEl);
  };
  reader.onerror = () => reportFileError(file, statusEl, 'Não foi possível ler o arquivo.');
  reader.readAsText(file);
}

function processSpreadsheetFile(file, statusEl) {
  if (typeof XLSX === 'undefined') {
    reportFileError(
      file,
      statusEl,
      'Biblioteca de leitura de planilhas não carregou (verifique a conexão com a internet) — use .txt/.csv ou tente novamente.'
    );
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'array' });
      const emails = extractEmailsFromWorkbook(workbook);
      reportFileEmails(file, emails, statusEl);
    } catch (err) {
      console.error('[IPROTIC] Erro ao ler planilha:', err);
      reportFileError(file, statusEl, 'Não foi possível ler essa planilha. Verifique o formato do arquivo.');
    }
  };
  reader.onerror = () => reportFileError(file, statusEl, 'Não foi possível ler o arquivo.');
  reader.readAsArrayBuffer(file);
}

/**
 * Lê a primeira aba da planilha e extrai os valores da primeira
 * coluna preenchida (um e-mail/chave por linha, igual ao modo
 * manual). Se a primeira linha parecer um cabeçalho (não contém
 * "@" mas as linhas seguintes contêm), ela é descartada.
 */
function extractEmailsFromWorkbook(workbook) {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let values = rows
    .map(row => (row && row[0] !== undefined ? String(row[0]).trim() : ''))
    .filter(v => v.length > 0);

  const looksLikeHeader = values.length > 1
    && !values[0].includes('@')
    && values.slice(1).some(v => v.includes('@'));
  if (looksLikeHeader) values = values.slice(1);

  return values;
}

function reportFileEmails(file, emails, statusEl) {
  statusEl.textContent = `✓ ${file.name} — ${emails.length} e-mail${emails.length !== 1 ? 's' : ''} encontrado${emails.length !== 1 ? 's' : ''}`;
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--sn-green-dark)';
  /* Armazena para uso na coleta de dados */
  statusEl.dataset.emails = JSON.stringify(emails);
}

function reportFileError(file, statusEl, message) {
  statusEl.textContent = `✗ ${file.name} — ${message}`;
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--sn-red)';
  delete statusEl.dataset.emails;
}

/* ──────────────────────────────────────────────────────────
   PRÉ-VISUALIZAÇÃO
────────────────────────────────────────────────────────── */
function initPreview() {
  document.getElementById('preview-btn').addEventListener('click', () => {
    const data = collectData();
    if (!data) return;

    const area = document.getElementById('preview-area');
    const body = document.getElementById('preview-body');

    const emailPreview = data.emails.slice(0, 5).join('\n')
      + (data.emails.length > 5 ? `\n… +${data.emails.length - 5} mais` : '');

    body.innerHTML = `
      <div class="preview-row">
        <span class="preview-key">Para outra pessoa?</span>
        <span class="preview-val">${data.para_outra_pessoa}</span>
      </div>
      <hr class="preview-separator">
      <div class="preview-row">
        <span class="preview-key">E-mails (${data.emails.length})</span>
      </div>
      <div class="preview-val emails">${emailPreview}</div>
      <hr class="preview-separator">
      <div class="preview-row">
        <span class="preview-key">O que deseja?</span>
        <span class="preview-val">${data.o_que_deseja}</span>
      </div>
      <div class="preview-row">
        <span class="preview-key">Tipo de atendimento</span>
        <span class="preview-val">${data.tipo_atendimento}</span>
      </div>
      <div class="preview-row">
        <span class="preview-key">Mesa responsável</span>
        <span class="preview-val">${data.mesa_responsavel}</span>
      </div>
      ${data.info_adicional
        ? `<hr class="preview-separator">
           <div class="preview-row">
             <span class="preview-key">Informações adicionais</span>
             <span class="preview-val">${data.info_adicional}</span>
           </div>`
        : ''}
    `;

    area.style.display = 'block';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ──────────────────────────────────────────────────────────
   ENVIO DO FORMULÁRIO — abre uma aba do ServiceNow por e-mail
────────────────────────────────────────────────────────── */

/* Guarda as URLs que o navegador bloqueou na última tentativa,
   para permitir um "reabrir" com um clique explícito do analista
   (necessário porque window.open só funciona de forma confiável
   quando disparado diretamente por uma ação do usuário). */
let lastBlockedUrls = [];

function initSubmit() {
  document.getElementById('main-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = collectData();
    if (!data) return;
    runOpenTickets(data.emails, data);
  });
}

function initRetryBlocked() {
  const retryBtn = document.getElementById('retry-blocked-btn');
  if (!retryBtn) return;
  retryBtn.addEventListener('click', () => {
    const urls = lastBlockedUrls;
    lastBlockedUrls = [];
    hideBlockedNotice();

    openUrlsInTabs(urls).then(({ opened, blocked }) => {
      if (blocked.length > 0) {
        lastBlockedUrls = blocked;
        showBlockedNotice(blocked.length);
        showToast(
          `${opened} aba${opened !== 1 ? 's' : ''} aberta${opened !== 1 ? 's' : ''}, ${blocked.length} ainda bloqueada${blocked.length !== 1 ? 's' : ''}. Permita pop-ups para este site e tente de novo.`,
          'error'
        );
      } else {
        showToast(`${opened} aba${opened !== 1 ? 's' : ''} reaberta${opened !== 1 ? 's' : ''} com sucesso.`, 'success');
      }
    });
  });
}

/**
 * Gera o arquivo iprotic-chamados.json com os dados do formulário,
 * no formato que o script Python (automacao_iprotic.py) espera —
 * alternativa 100% automática para quem não pode instalar o
 * Tampermonkey (bloqueio de TI) nem usar o bookmarklet.
 */
function initDownloadJson() {
  const btn = document.getElementById('download-json-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const data = collectData();
    if (!data) return;

    const payload = {
      gerado_em: new Date().toISOString(),
      tickets: data.emails.map(email => ({
        email,
        para_outra_pessoa: data.para_outra_pessoa,
        o_que_deseja: data.o_que_deseja,
        tipo_atendimento: data.tipo_atendimento,
        mesa_responsavel: data.mesa_responsavel,
        info_adicional: data.info_adicional,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'iprotic-chamados.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast(`Arquivo baixado com ${data.emails.length} chamado${data.emails.length !== 1 ? 's' : ''}. Use-o com o automacao_iprotic.py.`, 'success');
  });
}

/**
 * Constrói a URL do item de catálogo do ServiceNow para um e-mail
 * específico, levando junto os dados do chamado como parâmetros
 * de URL. O userscript de auto-preenchimento (Tampermonkey) lê
 * esses parâmetros e preenche o formulário automaticamente.
 */
function buildServiceNowUrl(data, email) {
  const params = new URLSearchParams({
    iprotic_requester: email,
    iprotic_para_outra_pessoa: data.para_outra_pessoa,
    iprotic_o_que_deseja: data.o_que_deseja,
    iprotic_tipo_atendimento: data.tipo_atendimento,
    iprotic_mesa_responsavel: data.mesa_responsavel,
    iprotic_info_adicional: data.info_adicional || ''
  });
  const separator = SERVICENOW_CATALOG_URL.includes('?') ? '&' : '?';
  return `${SERVICENOW_CATALOG_URL}${separator}${params.toString()}`;
}

/**
 * Abre uma lista de URLs, uma aba para cada uma, de forma síncrona
 * (mesmo laço de execução do clique que chamou esta função — ver
 * nota sobre TAB_OPEN_INTERVAL_MS acima). Retorna { opened, blocked }
 * — "blocked" são as URLs que o navegador recusou abrir.
 *
 * Continua com formato de Promise para manter a mesma forma de uso
 * no restante do código, mas resolve de forma síncrona/imediata.
 */
function openUrlsInTabs(urls) {
  const blocked = [];
  let opened = 0;

  for (const url of urls) {
    let win = null;
    try {
      win = window.open(url, '_blank');
    } catch (err) {
      win = null;
    }
    if (win) {
      opened++;
    } else {
      blocked.push(url);
    }
  }

  return Promise.resolve({ opened, blocked });
}

function runOpenTickets(emails, data) {
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = `
    <svg viewBox="0 0 16 16" fill="currentColor" style="animation:spin 0.8s linear infinite">
      <path d="M8 1a7 7 0 107 7A7 7 0 008 1zm0 12.5A5.5 5.5 0 118 2.5 5.5 5.5 0 018 13.5z" opacity=".3"/>
      <path d="M8 1a7 7 0 010 14V1z" opacity=".9"/>
    </svg> Abrindo abas…`;
  hideBlockedNotice();

  const urls = emails.map(email => buildServiceNowUrl(data, email));
  console.log('[IPROTIC] Abrindo', urls.length, 'chamado(s) no ServiceNow:', urls);

  openUrlsInTabs(urls).then(({ opened, blocked }) => {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M15.854.146a.5.5 0 01.11.54l-5.819 14.547a.75.75 0 01-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 01.124-1.33L15.314.037a.5.5 0 01.54.11z"/>
      </svg> Enviar Chamados`;

    if (blocked.length > 0) {
      lastBlockedUrls = blocked;
      showBlockedNotice(blocked.length);
      showToast(
        `${opened} aba${opened !== 1 ? 's' : ''} aberta${opened !== 1 ? 's' : ''}, ${blocked.length} bloqueada${blocked.length !== 1 ? 's' : ''} pelo navegador.`,
        'error'
      );
    } else {
      showToast(
        `${opened} chamado${opened > 1 ? 's enviados' : ' enviado'} — verifique as abas abertas.`,
        'success'
      );
    }
  });
}

function showBlockedNotice(count) {
  const notice = document.getElementById('blocked-notice');
  if (!notice) return;
  document.getElementById('blocked-count').textContent = count;
  notice.style.display = 'flex';
}

function hideBlockedNotice() {
  const notice = document.getElementById('blocked-notice');
  if (notice) notice.style.display = 'none';
}

/* ──────────────────────────────────────────────────────────
   COLETA E VALIDAÇÃO DOS DADOS DO FORMULÁRIO
────────────────────────────────────────────────────────── */
function collectData() {
  const para_outra_pessoa = document.querySelector('input[name="para_outra_pessoa"]:checked')?.value || 'Sim';

  /* E-mails */
  const activeMode = document.querySelector('.mode-tab.active').dataset.mode;
  let emails = [];

  if (activeMode === 'manual') {
    emails = parseEmails(document.getElementById('email-manual').value);
  } else {
    const statusEl = document.getElementById('file-status');
    const stored   = statusEl.dataset.emails;
    if (!stored) {
      showToast('Nenhum arquivo carregado.', 'error');
      return null;
    }
    emails = JSON.parse(stored);
  }

  if (emails.length === 0) {
    showToast('Insira ao menos um e-mail.', 'error');
    document.getElementById('email-manual').focus();
    return null;
  }

  /* Campos do chamado */
  const o_que_deseja    = document.getElementById('o-que-deseja').value;
  const tipo_atendimento = document.getElementById('tipo-atendimento').value;
  const mesa_responsavel = document.getElementById('mesa-responsavel').value;
  const info_adicional   = document.getElementById('info-adicional').value.trim();

  if (!o_que_deseja)     { showToast('Campo "O que você deseja" inválido.', 'error');     return null; }
  if (!tipo_atendimento) { showToast('Selecione o tipo de atendimento.', 'error');         return null; }
  if (!mesa_responsavel) { showToast('Campo "Mesa responsável" inválido.', 'error');        return null; }

  return { para_outra_pessoa, emails, o_que_deseja, tipo_atendimento, mesa_responsavel, info_adicional };
}

/* ──────────────────────────────────────────────────────────
   UTILITÁRIOS
────────────────────────────────────────────────────────── */

/**
 * Converte uma string bruta em lista de e-mails válidos.
 * Aceita separadores: nova linha, vírgula, ponto-e-vírgula.
 */
function parseEmails(raw) {
  return raw
    .split(/[\n,;]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0);
}

/**
 * Exibe uma notificação toast temporária.
 * @param {string} msg  - Texto da mensagem
 * @param {'success'|'error'} type - Tipo visual
 */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.className = `show ${type}`;
  setTimeout(() => { toast.className = type; }, 3500);
}
