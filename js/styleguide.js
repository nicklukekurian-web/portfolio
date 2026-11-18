// Styleguide only: render the light panel from the dark one so both stay identical.
export function initStyleguide() {
  const dark = document.getElementById('sg-dark');
  const light = document.getElementById('sg-light');
  if (!dark || !light) return;
  const copy = dark.cloneNode(true);
  copy.querySelectorAll('[id]').forEach((el) => { el.id = `${el.id}-light`; });
  copy.querySelectorAll('[aria-labelledby]').forEach((el) => {
    el.setAttribute('aria-labelledby', `${el.getAttribute('aria-labelledby')}-light`);
  });
  copy.querySelector('.sg-tag').textContent = 'Theme: light';
  light.replaceChildren(...copy.childNodes);
}
