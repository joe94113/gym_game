// Vite supplies the published directory (for example /gym-game/ on Pages).
// Keep public assets inside that directory, including when called from Node
// qualification tools where import.meta.env is absent.
export function publicAssetUrl(path, base = import.meta.env?.BASE_URL || '/') {
  const value = String(path);
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return value;
  const directory = String(base || '/').replace(/\/*$/, '/');
  return directory + value.replace(/^\/+/, '');
}
