export function muscleMap(keys = [], secondaryKeys = [], size = 'normal') {
  const active = new Set(keys);
  const supporting = new Set(secondaryKeys);
  const fill = (key) => active.has(key) ? '#dc6855' : supporting.has(key) ? '#e2a261' : '#d9ddd6';
  const part = (key, d) => `<path data-muscle="${key}" data-activation="${active.has(key) ? 'primary' : supporting.has(key) ? 'secondary' : 'none'}" d="${d}" fill="${fill(key)}" stroke="#f5f6f1" stroke-width="1.8"/>`;
  const figure = (back = false) => `
    <circle cx="55" cy="20" r="12" fill="#d9ddd6"/>
    <path d="M49 31H61L64 43H46Z" fill="#d9ddd6"/>
    ${part('shoulders', 'M44 40Q30 38 25 53L23 65L34 68L42 54Z')}
    ${part('shoulders', 'M66 40Q80 38 85 53L87 65L76 68L68 54Z')}
    ${part(back ? 'back' : 'chest', 'M44 41L54 45L54 70L38 66L35 55Z')}
    ${part(back ? 'back' : 'chest', 'M66 41L56 45L56 70L72 66L75 55Z')}
    ${part(back ? 'triceps' : 'biceps', 'M24 65L34 68L30 89L20 88Z')}
    ${part(back ? 'triceps' : 'biceps', 'M86 65L76 68L80 89L90 88Z')}
    ${part('forearms', 'M20 90L29 91L25 115L17 115Z M90 90L81 91L85 115L93 115Z')}
    <ellipse cx="20" cy="120" rx="4.5" ry="7" fill="#d9ddd6"/>
    <ellipse cx="90" cy="120" rx="4.5" ry="7" fill="#d9ddd6"/>
    ${part(back ? 'back' : 'core', 'M38 68L54 73L54 104L41 107L37 88Z')}
    ${part(back ? 'back' : 'core', 'M72 68L56 73L56 104L69 107L73 88Z')}
    ${part(back ? 'glutes' : 'core', 'M41 107L54 106L54 125L40 127L37 118Z')}
    ${part(back ? 'glutes' : 'core', 'M69 107L56 106L56 125L70 127L73 118Z')}
    ${back?'':part('hipFlexors','M39 109L48 112L50 127L43 135L38 124Z M71 109L62 112L60 127L67 135L72 124Z')}
    ${part(back ? 'hamstrings' : 'quads', 'M40 128L53 127L51 163L39 164L36 143Z')}
    ${part(back ? 'hamstrings' : 'quads', 'M70 128L57 127L59 163L71 164L74 143Z')}
    ${part('adductors','M49 129L54 128L52 155L48 155Z M61 129L56 128L58 155L62 155Z')}
    <path d="M39 164H51V173H39Z M59 164H71V173H59Z" fill="#d9ddd6"/>
    ${part('calves', 'M39 174H51L49 203L42 204L37 185Z')}
    ${part('calves', 'M59 174H71L73 185L68 204L61 203Z')}
    <path d="M41 205H49V217H35L35 212Z M61 205H69L75 212V217H61Z" fill="#d9ddd6"/>
    <text x="55" y="236" text-anchor="middle" fill="#91978e" font-size="9" letter-spacing="2">${back ? '背面' : '正面'}</text>`;
  return `<svg class="muscle-map ${size}" viewBox="0 0 254 246" role="img" aria-label="肌群位置示意，紅色為主要目標、橘色為輔助參與"><g transform="translate(7 0)">${figure()}</g><g transform="translate(137 0)">${figure(true)}</g></svg>`;
}
