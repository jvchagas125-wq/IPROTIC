/* ============================================================
   IPROTIC — Abertura de Chamados ServiceNow
   script.js
   Minsait · Grupo Indra
   ============================================================ */

/* ──────────────────────────────────────────────────────────
   CONSTANTES — valores fixos vinculados ao script Python
   Estes valores são preenchidos automaticamente e refletem
   exatamente os parâmetros esperados pelo script Python.
────────────────────────────────────────────────────────── */
const PYTHON_DEFAULTS = {
  o_que_deseja:   'Registros de Proatividade',
  mesa_responsavel: 'N1-SD_PADRAO'
};

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
      ? `cada um dos <strong>${n} e-mail${n > 1 ? 's' : ''}</strong> inserido${n > 1 ? 's' : ''}`
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
  const reader = new FileReader();
  reader.onload = e => {
    const emails = parseEmails(e.target.result);
    statusEl.textContent = `✓ ${file.name} — ${emails.length} e-mail${emails.length !== 1 ? 's' : ''} encontrado${emails.length !== 1 ? 's' : ''}`;
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--sn-green-dark)';
    /* Armazena para uso na coleta de dados */
    statusEl.dataset.emails = JSON.stringify(emails);
  };
  reader.readAsText(file);
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
   ENVIO DO FORMULÁRIO
────────────────────────────────────────────────────────── */
function initSubmit() {
  document.getElementById('main-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = collectData();
    if (!data) return;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor" style="animation:spin 0.8s linear infinite">
        <path d="M8 1a7 7 0 107 7A7 7 0 008 1zm0 12.5A5.5 5.5 0 118 2.5 5.5 5.5 0 018 13.5z" opacity=".3"/>
        <path d="M8 1a7 7 0 010 14V1z" opacity=".9"/>
      </svg> Processando…`;

    /*
     * PONTO DE INTEGRAÇÃO COM O SCRIPT PYTHON
     * ─────────────────────────────────────────
     * Os dados abaixo são os parâmetros que o script Python
     * espera receber. Substitua o setTimeout pelo método de
     * comunicação adequado (ex: fetch para uma API local,
     * ou pywebview / tkinter bridge, dependendo da implementação).
     *
     * Estrutura do objeto `data`:
     * {
     *   para_outra_pessoa: "Sim" | "Não",
     *   emails:            string[],           <- lista de e-mails/chaves
     *   o_que_deseja:      "Registros de Proatividade",  <- fixo
     *   tipo_atendimento:  string,             <- selecionado pelo analista
     *   mesa_responsavel:  "N1-SD_PADRAO",     <- fixo
     *   info_adicional:    string              <- opcional
     * }
     */
    console.log('[IPROTIC] Payload para o script Python:', JSON.stringify(data, null, 2));

    /* TODO: substituir pelo método de integração com o Python */
    setTimeout(() => {
      showToast(
        `${data.emails.length} chamado${data.emails.length > 1 ? 's enviados' : ' enviado'} com sucesso!`,
        'success'
      );
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M15.854.146a.5.5 0 01.11.54l-5.819 14.547a.75.75 0 01-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 01.124-1.33L15.314.037a.5.5 0 01.54.11z"/>
        </svg> Enviar Chamados`;
    }, 1800);
  });
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
