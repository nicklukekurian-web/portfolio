// Screenshot lightbox on a native <dialog>: Esc closes, focus returns to the opener.
export function initLightbox() {
  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-label', 'Enlarged screenshot');
  const bar = document.createElement('div');
  bar.className = 'lightbox-bar label';
  const caption = document.createElement('span');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-secondary';
  close.textContent = 'Close';
  bar.append(caption, close);
  const img = document.createElement('img');
  img.decoding = 'async';
  dialog.append(bar, img);
  document.body.append(dialog);

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  for (const btn of document.querySelectorAll('[data-lightbox]')) {
    btn.addEventListener('click', () => {
      const thumb = btn.querySelector('img');
      img.src = btn.dataset.lightbox;
      img.alt = thumb ? thumb.alt : '';
      caption.textContent = img.alt;
      dialog.showModal();
      close.focus();
    });
  }
}
