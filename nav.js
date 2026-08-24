/* ============================================================
   IPROTIC — Menu lateral (hambúrguer)
   nav.js — compartilhado entre index.html, sobre.html e avisos.html
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const btn      = document.getElementById('hamburger-btn');
  const menu     = document.getElementById('side-menu');
  const backdrop = document.getElementById('side-menu-backdrop');
  const closeBtn = document.getElementById('side-menu-close');

  if (!btn || !menu || !backdrop) return; // página sem menu lateral

  function openMenu() {
    menu.classList.add('open');
    backdrop.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
  }

  function closeMenu() {
    menu.classList.remove('open');
    backdrop.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }

  btn.addEventListener('click', () => {
    menu.classList.contains('open') ? closeMenu() : openMenu();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  /* Destaca, no menu, o link correspondente à página atual
     (definida via <body data-page="..."> em cada página). */
  const currentPage = document.body.dataset.page;
  if (currentPage) {
    const activeLink = menu.querySelector(`a[data-page="${currentPage}"]`);
    if (activeLink) activeLink.classList.add('active');
  }
});
