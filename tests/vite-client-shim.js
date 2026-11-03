// Keep Vite's CSS injection exports while preventing HMR from reloading an
// active browser test when another worker edits an unrelated source module.
export const viteClientShim = `
const styles = new Map();
export function updateStyle(id, content) {
  let style = styles.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
    styles.set(id, style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  styles.get(id)?.remove();
  styles.delete(id);
}
export function createHotContext() {
  return {data:{},accept(){},acceptExports(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){}};
}
export function injectQuery(url, query) {
  const index = url.indexOf('#');
  const hash = index < 0 ? '' : url.slice(index);
  const base = index < 0 ? url : url.slice(0, index);
  return base + (base.includes('?') ? '&' : '?') + query + hash;
}
`;
