// SVG markup for the "مشوار لبّيك" order card: a Levant street (domes, minarets, rooftop water tanks,
// laundry lines, olive and palm trees) drawn in layers that scroll at different speeds.
// Pure string builders, no React, so they can be tested directly.
export type TimeOfDay = 'day' | 'dusk' | 'night';
export type ScenePalette = { sky: [string, string, string]; far: string; mid: string; near: string; street: string; win: string; winOff: string; lamp: number };

export const PALETTES: Record<TimeOfDay, ScenePalette> = {
  night: { sky: ['#071423', '#12304A', '#1D4660'], far: '#10283A', mid: '#0C1D2A', near: '#08131C', street: '#060D12', win: '#FFD76A', winOff: '#0E1C26', lamp: 1 },
  day: { sky: ['#4FA8E0', '#9AD3F2', '#D9F1FB'], far: '#A9C9C4', mid: '#7E9E94', near: '#5B776D', street: '#3B4E47', win: '#2C3E38', winOff: '#4D665D', lamp: 0 },
  dusk: { sky: ['#2A1A44', '#C2557A', '#FFB46A'], far: '#6B3D5E', mid: '#4A2846', near: '#2E1A30', street: '#1C1020', win: '#FFC56B', winOff: '#3A2236', lamp: 0.8 },
};

// Phone's local hour: day 6:00-16:59, dusk 17:00-18:59, night otherwise.
export function timeOfDay(hour: number): TimeOfDay {
  return hour >= 6 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night';
}

export const TILE = 440; // each layer is two identical tiles side by side so the scroll loops seamlessly

function seeded(seed: number) { let x = seed; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
const r1 = (n: number) => n.toFixed(1);
const twice = (h: number, inner: string) => `<svg width="${TILE * 2}" height="${h}" viewBox="0 0 ${TILE * 2} ${h}"><g>${inner}</g><g transform="translate(${TILE} 0)">${inner}</g></svg>`;

export const SKY_HEIGHT = { far: 70, mid: 84, near: 72, street: 56, clouds: 50 } as const;

export function skyXml(p: ScenePalette) {
  return `<svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="0.6" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient></defs><rect width="10" height="10" fill="url(#s)"/></svg>`;
}

export function farXml(p: ScenePalette) {
  const r = seeded(3); let d = 'M0 70 ';
  for (let x = 0; x <= TILE; x += 20) d += `L${x} ${r1(28 + Math.sin(x / 70) * 12 + r() * 8)} `;
  return twice(SKY_HEIGHT.far, `<path d="${d}L${TILE} 70Z" fill="${p.far}"/>`);
}

export function midXml(p: ScenePalette) {
  const r = seeded(11), H = SKY_HEIGHT.mid, c = p.mid; let o = '', x = 0;
  while (x < TILE) {
    const t = r();
    if (t < 0.16) {
      const w = 44, h = 20, cx = x + w / 2;
      o += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" fill="${c}"/><rect x="${cx - 10}" y="${H - h - 6}" width="20" height="6" fill="${c}"/><path d="M${cx - 13} ${H - h - 6} a13 13 0 0 1 26 0z" fill="${c}"/><path d="M${cx} ${H - h - 19} v-6" stroke="${c}" stroke-width="1.6"/><circle cx="${cx}" cy="${H - h - 27}" r="2.2" fill="${c}"/>`;
      const mx = x + w + 3;
      o += `<rect x="${mx}" y="${H - 62}" width="6" height="62" fill="${c}"/><rect x="${mx - 2}" y="${H - 46}" width="10" height="3" fill="${c}"/><rect x="${mx - 1.5}" y="${H - 28}" width="9" height="2.5" fill="${c}"/><path d="M${mx} ${H - 62} l3 -9 l3 9z" fill="${c}"/><circle cx="${mx + 3}" cy="${H - 74}" r="1.6" fill="${c}"/>`;
      x += w + 14;
    } else if (t < 0.62) {
      const w = 22 + r() * 18, h = 20 + r() * 26;
      o += `<rect x="${r1(x)}" y="${r1(H - h)}" width="${r1(w)}" height="${r1(h)}" fill="${c}"/>`;
      if (r() < 0.7) { const tx = x + 3 + r() * (w - 12); o += `<rect x="${r1(tx)}" y="${r1(H - h - 7)}" width="8" height="7" rx="1" fill="${c}"/><ellipse cx="${r1(tx + 4)}" cy="${r1(H - h - 7)}" rx="4" ry="1.4" fill="${c}"/>`; }
      if (r() < 0.4) { const dx = x + w - 6; o += `<path d="M${r1(dx - 5)} ${r1(H - h - 2)} a6 6 0 0 1 10 -4" fill="none" stroke="${c}" stroke-width="2"/>`; }
      x += w + 1;
    } else {
      const w = 16 + r() * 12, h = 36 + r() * 22;
      o += `<rect x="${r1(x)}" y="${r1(H - h)}" width="${r1(w)}" height="${r1(h)}" fill="${c}"/>`;
      x += w + 2;
    }
  }
  return twice(H, o);
}

export function nearXml(p: ScenePalette) {
  const r = seeded(29), H = SKY_HEIGHT.near; let o = '', x = 4;
  const laundry = ['#E85D5D', '#5DA9E8', '#F2C14E', '#FFFFFF', '#8BD17C'];
  while (x < TILE) {
    const w = 30 + r() * 20, h = 20 + r() * 22;
    o += `<rect x="${r1(x)}" y="${r1(H - h)}" width="${r1(w)}" height="${r1(h)}" fill="${p.near}"/>`;
    for (let wy = H - h + 6; wy < H - 8; wy += 11) for (let wx = x + 4; wx < x + w - 7; wx += 9) o += `<rect x="${r1(wx)}" y="${r1(wy)}" width="5" height="6" rx="1" fill="${r() > 0.45 ? p.win : p.winOff}"/>`;
    if (r() < 0.55) {
      const by = H - h + 16 + r() * (h - 28);
      o += `<rect x="${r1(x - 2)}" y="${r1(by)}" width="${r1(w + 4)}" height="2" fill="${p.near}"/><path d="M${r1(x)} ${r1(by - 8)} Q${r1(x + w / 2)} ${r1(by - 3)} ${r1(x + w)} ${r1(by - 8)}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.7"/>`;
      for (let k = 0; k < 4; k++) o += `<rect x="${r1(x + 5 + k * (w - 10) / 4)}" y="${r1(by - 7 + Math.sin(k) * 1.2)}" width="4" height="5" fill="${laundry[(k + Math.floor(x)) % 5]}" opacity="0.9"/>`;
    }
    x += w + 3 + r() * 6;
  }
  return twice(H, o);
}

export function streetXml(p: ScenePalette) {
  const r = seeded(53), H = SKY_HEIGHT.street; let o = '';
  for (let x = 20; x < TILE; x += 110) {
    o += `<rect x="${x}" y="${H - 46}" width="2.4" height="46" fill="#1B2228"/><path d="M${x + 1} ${H - 46} q8 -2 12 4" fill="none" stroke="#1B2228" stroke-width="2.2"/>`;
    if (p.lamp > 0) o += `<circle cx="${x + 13}" cy="${H - 41}" r="2.6" fill="#FFE7A0" opacity="${p.lamp}"/><circle cx="${x + 13}" cy="${H - 41}" r="7" fill="#FFE7A0" opacity="${r1(p.lamp * 0.3)}"/>`;
    else o += `<circle cx="${x + 13}" cy="${H - 41}" r="2.6" fill="#8A949A"/>`;
  }
  for (let x = 70; x < TILE; x += 110) {
    if (r() < 0.5) {
      o += `<path d="M${x} ${H} q2 -18 -2 -30" fill="none" stroke="#3E2F22" stroke-width="3"/>`;
      for (let k = 0; k < 6; k++) { const a = -2.6 + k * 0.95; o += `<path d="M${x - 2} ${H - 30} q${r1(Math.cos(a) * 10)} ${r1(Math.sin(a) * 8 - 4)} ${r1(Math.cos(a) * 18)} ${r1(Math.sin(a) * 10 + 4)}" fill="none" stroke="#2F5D38" stroke-width="2.4" stroke-linecap="round"/>`; }
    } else {
      o += `<rect x="${x - 1.5}" y="${H - 18}" width="3" height="18" fill="#3E2F22"/><ellipse cx="${x}" cy="${H - 24}" rx="13" ry="10" fill="#4F6B4A"/><ellipse cx="${x - 4}" cy="${H - 27}" rx="6" ry="4" fill="#6E8A64"/>`;
    }
  }
  return twice(H, o);
}

export function cloudsXml() {
  let o = '';
  for (const [x, y, s] of [[30, 22, 1], [170, 12, 0.7], [300, 26, 0.9], [400, 14, 0.6]]) o += `<g transform="translate(${x} ${y}) scale(${s})" fill="#FFFFFF"><ellipse cx="0" cy="0" rx="18" ry="8"/><ellipse cx="12" cy="-5" rx="12" ry="9"/><ellipse cx="24" cy="1" rx="14" ry="7"/></g>`;
  return twice(SKY_HEIGHT.clouds, o);
}

// Facing left (towards the customer's home on the left of the card). Wheels are drawn without spokes;
// the spokes are a separate rotating layer.
export function scooterXml(headlight: boolean) {
  const body = '#B7FF30', shade = '#8CCB12', ink = '#17210F', jacket = '#1F3A24';
  return `<svg viewBox="-60 -8 200 108">
${headlight ? '<defs><linearGradient id="bm" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#FFF6C8" stop-opacity="0.8"/><stop offset="1" stop-color="#FFF6C8" stop-opacity="0"/></linearGradient></defs><polygon points="38,26 -60,10 -60,48" fill="url(#bm)"/>' : ''}
<path d="M126 30h12M130 40h10M128 52h12" stroke="rgba(255,255,255,0.55)" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 6"/>
<circle cx="32" cy="80" r="13" fill="#0B0F0C"/><circle cx="32" cy="80" r="7.5" fill="#A7B0A9"/>
<circle cx="106" cy="80" r="13" fill="#0B0F0C"/><circle cx="106" cy="80" r="7.5" fill="#A7B0A9"/>
<path d="M20 80 Q32 62 46 80" fill="none" stroke="${body}" stroke-width="5" stroke-linecap="round"/>
<rect x="46" y="64" width="48" height="7" rx="3.5" fill="${body}"/>
<path d="M86 70 Q88 52 104 50 Q124 50 126 66 Q126 72 120 72 L92 72 Z" fill="${body}"/>
<path d="M92 72 L120 72 Q126 72 126 66 Q124 70 112 70 Z" fill="${shade}"/>
<path d="M40 78 Q35 54 46 32 L55 32 Q48 54 53 70 Z" fill="${body}"/>
<path d="M47 32 L43 20" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><path d="M37 20 H50" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>
<circle cx="41" cy="27" r="4.2" fill="#FFF6C8"/>
<rect x="88" y="45" width="30" height="7" rx="3.5" fill="${ink}"/>
<rect x="98" y="12" width="36" height="32" rx="7" fill="${ink}" stroke="${body}" stroke-width="1.6"/>
<text x="116" y="33" text-anchor="middle" font-family="Tajawal_900Black" font-weight="900" font-size="10.5" fill="${body}">لبّيك</text>
<path d="M98 44 H120" stroke="${ink}" stroke-width="3"/>
<path d="M96 44 Q84 46 76 52 Q68 58 62 64" fill="none" stroke="${jacket}" stroke-width="8" stroke-linecap="round"/>
<path d="M84 14 Q96 10 100 20 L102 44 L86 46 Q80 30 84 14 Z" fill="${jacket}"/>
<path d="M90 16 L94 44" stroke="${body}" stroke-width="2"/>
<path d="M86 22 Q66 22 46 21" fill="none" stroke="${jacket}" stroke-width="6" stroke-linecap="round"/>
<ellipse cx="80" cy="12" rx="5" ry="4.5" fill="#F2C9A0"/>
<circle cx="85" cy="5" r="11" fill="${ink}"/>
<path d="M74 4 Q74 -6 85 -6" fill="none" stroke="${body}" stroke-width="2.4" stroke-linecap="round"/>
<path d="M74 3 Q73 11 80 11 L82 3 Z" fill="#9FD8FF" opacity="0.85"/>
</svg>`;
}
// Geometry of the scooter drawing, used to place the spinning spokes over the wheels.
export const SCOOTER_VIEWBOX = { x: -60, y: -8, w: 200, h: 108 };
export const SCOOTER_WHEELS = [{ cx: 32, cy: 80 }, { cx: 106, cy: 80 }];
export const SPOKES_XML = '<svg viewBox="0 0 16 16"><path d="M8 1v14M1 8h14M3 3l10 10M13 3L3 13" stroke="#5C655F" stroke-width="1.4"/><circle cx="8" cy="8" r="2.4" fill="#0B0F0C"/></svg>';

export function houseXml(accent: string, win: string) {
  return `<svg viewBox="0 0 78 66"><rect x="6" y="20" width="62" height="46" fill="#D9CDB3"/><rect x="6" y="20" width="62" height="5" fill="#BFAF90"/>
<path d="M26 66 V46 a8 8 0 0 1 16 0 V66z" fill="${accent}"/><rect x="48" y="32" width="12" height="12" rx="2" fill="${win}"/><rect x="12" y="32" width="10" height="12" rx="2" fill="${win}"/>
<rect x="52" y="10" width="11" height="10" rx="1.5" fill="#8A9AA3"/><ellipse cx="57.5" cy="10" rx="5.5" ry="1.8" fill="#A6B4BB"/>
<g fill="#3D6B3A"><circle cx="8" cy="54" r="7"/><circle cx="4" cy="60" r="6"/><circle cx="70" cy="58" r="7"/></g>
<g fill="#FFFFFF"><circle cx="6" cy="51" r="1.4"/><circle cx="10" cy="56" r="1.2"/><circle cx="3" cy="59" r="1.2"/><circle cx="68" cy="55" r="1.3"/><circle cx="72" cy="60" r="1.2"/></g></svg>`;
}

export const BAG_XML = '<svg viewBox="0 0 70 74"><path d="M22 22 v-6 a13 13 0 0 1 26 0 v6" fill="none" stroke="#B7FF30" stroke-width="4" stroke-linecap="round"/><rect x="6" y="22" width="58" height="50" rx="10" fill="#17210F" stroke="#B7FF30" stroke-width="2"/><text x="35" y="47" text-anchor="middle" font-family="Tajawal_900Black" font-weight="900" font-size="15" fill="#B7FF30">لبّيك</text><path d="M35 66c-5-3.5-6-5.5-6-7.5a3 3 0 0 1 6-.8 3 3 0 0 1 6 .8c0 2-1 4-6 7.5z" fill="#FF8FA3"/></svg>';
export const JASMINE_XML = `<svg viewBox="0 0 20 20"><g fill="#FFFFFF">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="10" cy="5" rx="3.2" ry="5" transform="rotate(${a} 10 10)"/>`).join('')}</g><circle cx="10" cy="10" r="2" fill="#F5D76E"/></svg>`;
export const RAIN_XML = (() => { let o = ''; for (let y = 0; y < 2; y++) for (let x = 0; x < 30; x++) o += `<path d="M${x * 14} ${y * 70} l-6 18" stroke="rgba(220,235,255,0.6)" stroke-width="1.2"/><path d="M${x * 14 + 3} ${y * 70 + 36} l-6 18" stroke="rgba(220,235,255,0.5)" stroke-width="1"/>`; return `<svg width="420" height="140" viewBox="0 0 420 140">${o}</svg>`; })();
