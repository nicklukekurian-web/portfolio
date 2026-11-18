// [Copy email] buttons: copy the address and announce the result in the nearby live region.
export function initCopyEmail() {
  for (const btn of document.querySelectorAll('[data-copy-email]')) {
    const status = btn.parentElement.querySelector('.copy-status');
    let timer = 0;
    btn.addEventListener('click', async () => {
      const address = btn.dataset.copyEmail;
      try {
        await navigator.clipboard.writeText(address);
        status.textContent = 'Copied';
      } catch {
        status.textContent = `Couldn't copy. The address is ${address}`;
      }
      clearTimeout(timer);
      timer = setTimeout(() => { status.textContent = ''; }, 4000);
    });
  }
}
