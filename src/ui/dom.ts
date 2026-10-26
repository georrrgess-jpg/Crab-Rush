/** Tiny DOM helpers. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function btn(label: string, cls: string, onClick: () => void, aria?: string): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, label);
  b.type = 'button';
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}
