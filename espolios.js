/**
 * Operamind — Espólios
 *
 * Tudo que dá sentido às moedas Blooms:
 *   1. Catálogo de itens de personalização (gratuitos e pagos)
 *   2. Renderizador do personagem em SVG (desenhado do zero, sem assets externos)
 *   3. Carteira: compra e equipamento de itens (gravados no registro do usuário)
 *   4. Troféus por acertos no nível "Entender"
 *
 * Depende de db.js (DB.getUser / DB.updateUser / DB.getSessions).
 *
 * Dados gravados no usuário (bloom_users):
 *   blooms: number
 *   avatar: { base, skin, eyes, eyeColor, hair, hairColor, top, pants, shoes, hat, earrings, ring }
 *   owned:  ["hair:moicano", "hat:coroa", ...]   ← só itens pagos comprados
 */

const Espolios = (() => {

  // ── Catálogo ───────────────────────────────────────────────────────────────
  // price 0 = gratuito. Preços entre 2 e 10 blooms.
  const CATALOG = {
    base: { label: 'Tipo de corpo', kind: 'style', items: [
      { id: 'm', name: 'Masculino', price: 0 },
      { id: 'f', name: 'Feminino',  price: 0 },
    ]},
    skin: { label: 'Tom de pele', kind: 'color', items: [
      { id: 's1', name: 'Clara',        color: '#f9d7c0', price: 0 },
      { id: 's2', name: 'Clara rosada', color: '#efc0a0', price: 0 },
      { id: 's3', name: 'Média',        color: '#d9a077', price: 0 },
      { id: 's4', name: 'Morena',       color: '#b87a52', price: 0 },
      { id: 's5', name: 'Escura',       color: '#8d5a3a', price: 0 },
      { id: 's6', name: 'Retinta',      color: '#5e3a26', price: 0 },
    ]},
    eyes: { label: 'Tipo de olhos', kind: 'style', items: [
      { id: 'redondos',   name: 'Redondos',   price: 0 },
      { id: 'amendoados', name: 'Amendoados', price: 0 },
      { id: 'sonolentos', name: 'Sonolentos', price: 3 },
      { id: 'brilhantes', name: 'Brilhantes', price: 6 },
    ]},
    eyeColor: { label: 'Cor dos olhos', kind: 'color', items: [
      { id: 'castanho', name: 'Castanho', color: '#6b3f1d', price: 0 },
      { id: 'preto',    name: 'Preto',    color: '#1f1a17', price: 0 },
      { id: 'azul',     name: 'Azul',     color: '#3b82f6', price: 0 },
      { id: 'verde',    name: 'Verde',    color: '#16a34a', price: 0 },
      { id: 'mel',      name: 'Mel',      color: '#c98a1b', price: 2 },
      { id: 'violeta',  name: 'Violeta',  color: '#9b30ff', price: 5 },
      { id: 'neon',     name: 'Ciano neon', color: '#00e5ff', price: 8 },
    ]},
    hair: { label: 'Cabelo', kind: 'style', items: [
      { id: 'careca',    name: 'Careca',         price: 0 },
      { id: 'curto',     name: 'Curto',          price: 0 },
      { id: 'longo',     name: 'Longo',          price: 0 },
      { id: 'topete',    name: 'Franja lateral', price: 2 },
      { id: 'coque',     name: 'Coque',          price: 3 },
      { id: 'rabo',      name: 'Rabo de cavalo', price: 3 },
      { id: 'cacheado',  name: 'Black power',    price: 5 },
      { id: 'moicano',   name: 'Moicano',        price: 8 },
    ]},
    hairColor: { label: 'Cor do cabelo', kind: 'color', items: [
      { id: 'preto',    name: 'Preto',     color: '#1c1917', price: 0 },
      { id: 'castanho', name: 'Castanho',  color: '#5b3a1e', price: 0 },
      { id: 'loiro',    name: 'Loiro',     color: '#e0b04a', price: 0 },
      { id: 'ruivo',    name: 'Ruivo',     color: '#b4441c', price: 0 },
      { id: 'grisalho', name: 'Grisalho',  color: '#b8b8c0', price: 2 },
      { id: 'rosa',     name: 'Rosa',      color: '#ff2d78', price: 5 },
      { id: 'azul',     name: 'Azul',      color: '#2563eb', price: 5 },
      { id: 'roxo',     name: 'Roxo',      color: '#9b30ff', price: 6 },
      { id: 'verde',    name: 'Verde neon', color: '#00ff9d', price: 8 },
    ]},
    top: { label: 'Camisas e blusas', kind: 'style', items: [
      { id: 'camiseta_branca', name: 'Camiseta branca', price: 0 },
      { id: 'camiseta_roxa',   name: 'Camiseta roxa',   price: 0 },
      { id: 'regata',          name: 'Regata preta',    price: 0 },
      { id: 'manga_longa',     name: 'Manga longa ciano', price: 3 },
      { id: 'polo',            name: 'Polo verde',      price: 4 },
      { id: 'moletom',         name: 'Moletom rosa',    price: 6 },
      { id: 'jaqueta',         name: 'Jaqueta de couro', price: 8 },
    ]},
    pants: { label: 'Calças', kind: 'style', items: [
      { id: 'jeans',  name: 'Jeans',        price: 0 },
      { id: 'preta',  name: 'Calça preta',  price: 0 },
      { id: 'shorts', name: 'Shorts cáqui', price: 3 },
      { id: 'saia',   name: 'Saia roxa',    price: 3 },
      { id: 'jogger', name: 'Jogger cinza', price: 5 },
      { id: 'cargo',  name: 'Cargo verde',  price: 7 },
    ]},
    shoes: { label: 'Tênis', kind: 'style', items: [
      { id: 'branco',    name: 'Tênis branco',    price: 0 },
      { id: 'preto',     name: 'Tênis preto',     price: 0 },
      { id: 'vermelho',  name: 'Tênis vermelho',  price: 3 },
      { id: 'cano_alto', name: 'Cano alto roxo',  price: 6 },
      { id: 'dourado',   name: 'Tênis dourado',   price: 10 },
    ]},
    hat: { label: 'Chapéus', kind: 'style', items: [
      { id: 'nenhum',  name: 'Nenhum',  price: 0 },
      { id: 'bone',    name: 'Boné',    price: 3 },
      { id: 'gorro',   name: 'Gorro',   price: 4 },
      { id: 'cartola', name: 'Cartola', price: 8 },
      { id: 'coroa',   name: 'Coroa',   price: 10 },
    ]},
    earrings: { label: 'Brincos', kind: 'style', items: [
      { id: 'nenhum',  name: 'Nenhum',          price: 0 },
      { id: 'perola',  name: 'Pérola',          price: 2 },
      { id: 'argola',  name: 'Argola dourada',  price: 2 },
      { id: 'estrela', name: 'Estrela',         price: 5 },
      { id: 'cristal', name: 'Cristal neon',    price: 7 },
    ]},
    ring: { label: 'Anéis', kind: 'style', items: [
      { id: 'nenhum', name: 'Nenhum',          price: 0 },
      { id: 'prata',  name: 'Anel de prata',   price: 2 },
      { id: 'ouro',   name: 'Anel de ouro',    price: 5 },
      { id: 'rubi',   name: 'Anel de rubi',    price: 8 },
    ]},
  };

  const TABS = [
    { id: 'corpo',      label: 'Corpo',      cats: ['base', 'skin'] },
    { id: 'olhos',      label: 'Olhos',      cats: ['eyes', 'eyeColor'] },
    { id: 'cabelo',     label: 'Cabelo',     cats: ['hair', 'hairColor'] },
    { id: 'roupas',     label: 'Roupas',     cats: ['top', 'pants', 'shoes'] },
    { id: 'acessorios', label: 'Acessórios', cats: ['hat', 'earrings', 'ring'] },
  ];

  const DEFAULT_AVATAR = {
    m: { base: 'm', skin: 's3', eyes: 'redondos', eyeColor: 'castanho', hair: 'curto', hairColor: 'preto',
         top: 'camiseta_branca', pants: 'jeans', shoes: 'branco', hat: 'nenhum', earrings: 'nenhum', ring: 'nenhum' },
    f: { base: 'f', skin: 's3', eyes: 'amendoados', eyeColor: 'castanho', hair: 'longo', hairColor: 'castanho',
         top: 'camiseta_roxa', pants: 'jeans', shoes: 'branco', hat: 'nenhum', earrings: 'nenhum', ring: 'nenhum' },
  };

  function getItem(cat, id) {
    return (CATALOG[cat]?.items || []).find(i => i.id === id) || null;
  }
  function colorOf(cat, id) {
    const it = getItem(cat, id) || CATALOG[cat].items[0];
    return it.color;
  }

  // ── Renderizador SVG ──────────────────────────────────────────────────────
  // Sistema de coordenadas: viewBox 0 0 200 300. Cabeça em (100,78) r=40.
  let uidCounter = 0;

  function shade(hex, amt) {
    // amt < 0 escurece, > 0 clareia
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  const TOPS = {
    camiseta_branca: { color: '#f4f4f8', sleeve: 'short' },
    camiseta_roxa:   { color: '#7c3aed', sleeve: 'short' },
    regata:          { color: '#26262e', sleeve: 'none' },
    manga_longa:     { color: '#06b6d4', sleeve: 'long' },
    polo:            { color: '#16a34a', sleeve: 'short', collar: true },
    moletom:         { color: '#ff2d78', sleeve: 'long', hood: true },
    jaqueta:         { color: '#1f1f27', sleeve: 'long', jacket: true },
  };
  const PANTS = {
    jeans:  { color: '#2f5fa8', type: 'long', stitch: '#8fb3ea' },
    preta:  { color: '#1f1f27', type: 'long' },
    shorts: { color: '#b89b6a', type: 'short' },
    saia:   { color: '#7c3aed', type: 'skirt' },
    jogger: { color: '#6b7280', type: 'long', cuffs: true },
    cargo:  { color: '#4d6b3a', type: 'long', pockets: true },
  };
  const SHOES = {
    branco:    { color: '#f4f4f8', sole: '#c9c9d6' },
    preto:     { color: '#1f1f27', sole: '#f4f4f8' },
    vermelho:  { color: '#e11d48', sole: '#f4f4f8' },
    cano_alto: { color: '#7c3aed', sole: '#f4f4f8', high: true },
    dourado:   { color: '#f5c518', sole: '#8a6d00', shine: true },
  };

  function body(a) {
    const f = a.base === 'f';
    return {
      f,
      torso: f
        ? 'M71,134 Q73,126 86,124 L114,124 Q127,126 129,134 Q119,162 133,198 L67,198 Q81,162 71,134 Z'
        : 'M62,134 Q64,126 80,124 L120,124 Q136,126 138,134 L134,198 L66,198 Z',
      shoulderL: f ? [75, 134] : [66, 134],
      shoulderR: f ? [125, 134] : [134, 134],
      handL: f ? [62, 198] : [54, 202],
      handR: f ? [138, 198] : [146, 202],
    };
  }

  function lerp(p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }

  function hairBack(a, c) {
    switch (a.hair) {
      case 'longo':
        return `<path d="M58,76 Q54,30 100,30 Q146,30 142,76 L150,162 Q124,172 100,166 Q76,172 50,162 Z" fill="${c}"/>`;
      case 'cacheado': {
        let s = `<circle cx="100" cy="68" r="52" fill="${c}"/>`;
        for (let i = 0; i < 14; i++) {
          const ang = Math.PI * (0.95 + i * (1.1 / 13));
          const x = 100 + Math.cos(ang) * 52, y = 68 + Math.sin(ang) * 52;
          s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${c}"/>`;
        }
        return s;
      }
      case 'coque':
        return `<circle cx="100" cy="30" r="17" fill="${c}"/><circle cx="96" cy="26" r="5" fill="${shade(c, 0.15)}" opacity=".5"/>`;
      case 'rabo':
        return `<path d="M124,48 Q166,58 160,118 Q157,142 144,156 Q152,112 130,72 Z" fill="${c}"/>`;
      default: return '';
    }
  }

  function hairFront(a, c) {
    const hl = shade(c, 0.18);
    switch (a.hair) {
      case 'curto':
        return `<path d="M59,84 Q55,34 100,33 Q145,34 141,84 Q137,62 122,57 Q104,66 84,57 Q65,62 59,84 Z" fill="${c}"/>
                <path d="M80,42 Q96,37 112,40" stroke="${hl}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>`;
      case 'longo':
        return `<path d="M59,88 Q54,33 100,32 Q146,33 141,88 Q136,58 117,51 Q100,62 80,53 Q63,60 59,88 Z" fill="${c}"/>
                <path d="M82,41 Q98,36 114,39" stroke="${hl}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>`;
      case 'topete':
        return `<path d="M58,86 Q52,32 102,31 Q148,33 142,80 Q138,62 130,56 Q112,72 72,66 Q62,72 58,86 Z" fill="${c}"/>
                <path d="M74,50 Q104,40 128,54" stroke="${hl}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>`;
      case 'cacheado': {
        const xs = [66, 79, 92, 106, 120, 134], ys = [56, 47, 43, 43, 47, 56];
        return xs.map((x, i) => `<circle cx="${x}" cy="${ys[i]}" r="11" fill="${c}"/>`).join('');
      }
      case 'coque':
      case 'rabo':
        return `<path d="M60,82 Q57,36 100,35 Q143,36 140,82 Q132,52 100,49 Q68,52 60,82 Z" fill="${c}"/>
                <path d="M84,41 Q100,38 116,41" stroke="${hl}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>`;
      case 'moicano':
        return `<path d="M86,54 L82,14 L95,30 L100,4 L106,30 L118,14 L114,54 Q100,46 86,54 Z" fill="${c}"/>
                <path d="M64,70 Q70,50 86,48 M136,70 Q130,50 114,48" stroke="${c}" stroke-width="2" fill="none" opacity=".35"/>`;
      default: return '';
    }
  }

  function eyes(a, skin, uid) {
    const ic = colorOf('eyeColor', a.eyeColor);
    const lid = shade(skin, -0.12);
    const out = [];
    [85, 115].forEach((x, k) => {
      const y = 84, id = `${uid}e${k}`;
      let white, iris;
      switch (a.eyes) {
        case 'amendoados':
          white = `M${x - 9},${y} Q${x},${y - 8} ${x + 9},${y} Q${x},${y + 6} ${x - 9},${y} Z`;
          iris = `<circle cx="${x}" cy="${y - 0.5}" r="4.6" fill="${ic}"/><circle cx="${x}" cy="${y - 0.5}" r="2.2" fill="#111"/>
                  <circle cx="${x + 1.6}" cy="${y - 2}" r="1.3" fill="#fff"/>`;
          break;
        case 'sonolentos':
          white = `M${x - 8},${y} A8,5.5 0 0 0 ${x + 8},${y} A8,5.5 0 0 0 ${x - 8},${y} Z`;
          iris = `<circle cx="${x}" cy="${y + 1}" r="4.2" fill="${ic}"/><circle cx="${x}" cy="${y + 1}" r="2" fill="#111"/>
                  <path d="M${x - 9},${y + 0.5} Q${x},${y - 9} ${x + 9},${y + 0.5} Z" fill="${lid}"/>
                  <path d="M${x - 8.5},${y + 0.5} Q${x},${y - 1.5} ${x + 8.5},${y + 0.5}" stroke="#3a2a22" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
          break;
        case 'brilhantes':
          white = `M${x - 7},${y} A7,9 0 0 0 ${x + 7},${y} A7,9 0 0 0 ${x - 7},${y} Z`;
          iris = `<ellipse cx="${x}" cy="${y + 0.5}" rx="5.6" ry="7.4" fill="${ic}"/>
                  <ellipse cx="${x}" cy="${y + 2.5}" rx="3.6" ry="4.4" fill="${shade(ic, -0.45)}"/>
                  <circle cx="${x + 2}" cy="${y - 3}" r="2.2" fill="#fff"/><circle cx="${x - 2.2}" cy="${y + 3.5}" r="1.1" fill="#fff"/>`;
          break;
        default: // redondos
          white = `M${x - 7.5},${y} A7.5,7.5 0 0 0 ${x + 7.5},${y} A7.5,7.5 0 0 0 ${x - 7.5},${y} Z`;
          iris = `<circle cx="${x}" cy="${y}" r="5" fill="${ic}"/><circle cx="${x}" cy="${y}" r="2.4" fill="#111"/>
                  <circle cx="${x + 1.8}" cy="${y - 1.8}" r="1.5" fill="#fff"/>`;
      }
      out.push(`<clipPath id="${id}"><path d="${white}"/></clipPath>
        <path d="${white}" fill="#fff"/>
        <g clip-path="url(#${id})">${iris}</g>
        <path d="${white}" fill="none" stroke="#3a2a22" stroke-width="1.1" opacity=".55"/>`);
      if (a.base === 'f') {
        const dir = k === 0 ? -1 : 1;
        out.push(`<path d="M${x + dir * 7},${y - 3} l${dir * 4},-3 M${x + dir * 5},${y - 5} l${dir * 3},-4"
          stroke="#2a1d17" stroke-width="1.4" stroke-linecap="round"/>`);
      }
    });
    return out.join('');
  }

  function topLayer(a, B, skin) {
    const t = TOPS[a.top] || TOPS.camiseta_branca;
    const c = t.color, dk = shade(c, -0.18);
    let s = '';
    if (t.hood) s += `<path d="M78,126 Q76,108 100,106 Q124,108 122,126 Z" fill="${dk}"/>`;
    if (a.top === 'regata') {
      const w = B.f ? 0 : 4;
      s += `<path d="M${80 - w},128 L${120 + w},128 Q${B.f ? 119 : 128},162 ${B.f ? 133 : 134},198 L${B.f ? 67 : 66},198 Q${B.f ? 81 : 72},162 ${80 - w},128 Z" fill="${c}"/>
            <path d="M${82 - w},128 L${86 - w},122 M${118 + w},128 L${114 + w},122" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
    } else {
      s += `<path d="${B.torso}" fill="${c}"/>`;
      s += `<path d="M${B.f ? 70 : 70},196 L${B.f ? 130 : 130},196" stroke="${dk}" stroke-width="3" opacity=".5"/>`;
    }
    if (t.jacket) {
      s += `<path d="M92,126 L100,198 L108,126 Z" fill="#f4f4f8"/>
            <path d="M92,126 L86,150 L96,146 Z M108,126 L114,150 L104,146 Z" fill="${shade(c, 0.12)}"/>
            <line x1="100" y1="150" x2="100" y2="198" stroke="#9ca3af" stroke-width="1.2" stroke-dasharray="2 2"/>`;
    }
    if (t.hood) {
      s += `<path d="M86,168 L114,168 L118,190 L82,190 Z" fill="${dk}" opacity=".6"/>
            <path d="M95,128 L93,150 M105,128 L107,150" stroke="#f4f4f8" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    if (t.collar) {
      s += `<path d="M90,124 L100,134 L86,138 Z M110,124 L100,134 L114,138 Z" fill="${shade(c, 0.15)}"/>
            <circle cx="100" cy="142" r="1.4" fill="#f4f4f8"/><circle cx="100" cy="150" r="1.4" fill="#f4f4f8"/>`;
    }
    if (a.top === 'camiseta_roxa') {
      s += `<path d="M100,148 l3,6 6,1 -4.5,4 1.2,6 -5.7,-3 -5.7,3 1.2,-6 -4.5,-4 6,-1 Z" fill="#ffd700" opacity=".9"/>`;
    }
    return s;
  }

  function sleeves(a, B) {
    const t = TOPS[a.top] || TOPS.camiseta_branca;
    if (t.sleeve === 'none') return '';
    const k = t.sleeve === 'long' ? 0.86 : 0.38;
    const out = [];
    [[B.shoulderL, B.handL], [B.shoulderR, B.handR]].forEach(([sh, hd]) => {
      const e = lerp(sh, hd, k);
      out.push(`<line x1="${sh[0]}" y1="${sh[1]}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}"
        stroke="${t.color}" stroke-width="19" stroke-linecap="round"/>`);
      if (t.sleeve === 'long') {
        const e2 = lerp(sh, hd, 0.82);
        out.push(`<line x1="${e2[0].toFixed(1)}" y1="${e2[1].toFixed(1)}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}"
          stroke="${shade(t.color, -0.2)}" stroke-width="19" stroke-linecap="butt"/>`);
      }
    });
    return out.join('');
  }

  function pantsLayer(a, skin) {
    const p = PANTS[a.pants] || PANTS.jeans;
    const c = p.color, dk = shade(c, -0.22);
    let s = '';
    if (p.type === 'skirt') {
      s += `<path d="M68,192 L132,192 L142,234 Q100,242 58,234 Z" fill="${c}"/>
            <path d="M84,196 L80,236 M100,196 L100,238 M116,196 L120,236" stroke="${dk}" stroke-width="1.5" opacity=".6"/>
            <rect x="68" y="190" width="64" height="7" rx="3" fill="${dk}"/>`;
      return s;
    }
    const h = p.type === 'short' ? 30 : 66;
    s += `<rect x="66" y="190" width="68" height="14" rx="4" fill="${c}"/>
          <rect x="74" y="198" width="26" height="${h}" rx="4" fill="${c}"/>
          <rect x="100" y="198" width="26" height="${h}" rx="4" fill="${c}"/>
          <line x1="100" y1="200" x2="100" y2="${198 + h}" stroke="${dk}" stroke-width="1.5"/>
          <rect x="66" y="190" width="68" height="5" rx="2" fill="${dk}"/>`;
    if (p.stitch) s += `<path d="M78,202 Q86,210 96,204 M122,202 Q114,210 104,204" stroke="${p.stitch}" stroke-width="1.2" fill="none" stroke-dasharray="2 2"/>`;
    if (p.cuffs) s += `<rect x="74" y="254" width="26" height="10" rx="3" fill="${dk}"/><rect x="100" y="254" width="26" height="10" rx="3" fill="${dk}"/>`;
    if (p.pockets) s += `<rect x="75" y="222" width="12" height="14" rx="2" fill="${dk}"/><rect x="113" y="222" width="12" height="14" rx="2" fill="${dk}"/>`;
    return s;
  }

  function shoesLayer(a) {
    const sh = SHOES[a.shoes] || SHOES.branco;
    const y = sh.high ? 248 : 260, h = sh.high ? 28 : 16;
    let s = '';
    [[68, 101], [99, 132]].forEach(([x1, x2]) => {
      s += `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="${h}" rx="8" fill="${sh.color}"/>
            <rect x="${x1}" y="${y + h - 5}" width="${x2 - x1}" height="5" rx="2.5" fill="${sh.sole}"/>`;
      if (sh.high) s += `<path d="M${x1 + 10},${y + 6} h12 M${x1 + 10},${y + 11} h12 M${x1 + 10},${y + 16} h12" stroke="#f4f4f8" stroke-width="1.5"/>`;
      else s += `<path d="M${x1 + 11},${y + 5} h10" stroke="${shade(sh.color, -0.25)}" stroke-width="1.5"/>`;
      if (sh.shine) s += `<path d="M${x1 + 5},${y + 4} q4,-2 8,0" stroke="#fff8c4" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    });
    return s;
  }

  function hatLayer(a) {
    switch (a.hat) {
      case 'bone':
        return `<path d="M58,66 Q58,26 100,26 Q142,26 142,66 Z" fill="#2563eb"/>
                <path d="M50,66 Q100,54 150,66 Q100,78 50,66 Z" fill="#1d4ed8"/>
                <circle cx="100" cy="27" r="3.5" fill="#1d4ed8"/>
                <path d="M92,44 h16" stroke="#ffd700" stroke-width="4" stroke-linecap="round"/>`;
      case 'gorro':
        return `<path d="M58,70 Q56,22 100,22 Q144,22 142,70 Z" fill="#dc2626"/>
                <path d="M72,30 v36 M86,24 v44 M100,22 v46 M114,24 v44 M128,30 v36" stroke="#b91c1c" stroke-width="2"/>
                <rect x="55" y="60" width="90" height="15" rx="7" fill="#f4f4f8"/>
                <circle cx="100" cy="18" r="10" fill="#f4f4f8"/>`;
      case 'cartola':
        return `<rect x="70" y="-2" width="60" height="50" rx="4" fill="#1a1a22"/>
                <rect x="70" y="34" width="60" height="9" fill="#9b30ff"/>
                <ellipse cx="100" cy="50" rx="50" ry="8" fill="#26262e"/>
                <path d="M76,4 v28" stroke="#3a3a48" stroke-width="3" stroke-linecap="round"/>`;
      case 'coroa':
        return `<path d="M64,56 L62,22 L80,38 L92,12 L100,30 L108,12 L120,38 L138,22 L136,56 Z" fill="#ffd700" stroke="#b8860b" stroke-width="2" stroke-linejoin="round"/>
                <rect x="63" y="48" width="74" height="8" fill="#e6b800"/>
                <circle cx="100" cy="46" r="4" fill="#ff2d78"/><circle cx="80" cy="47" r="3" fill="#00e5ff"/><circle cx="120" cy="47" r="3" fill="#00e5ff"/>`;
      default: return '';
    }
  }

  function earringLayer(a) {
    const pts = [[61, 93], [139, 93]];
    return pts.map(([x, y]) => {
      switch (a.earrings) {
        case 'perola':  return `<circle cx="${x}" cy="${y + 1}" r="3" fill="#f8f5ee" stroke="#d6d0c4" stroke-width=".8"/>`;
        case 'argola':  return `<circle cx="${x}" cy="${y + 5}" r="5.5" fill="none" stroke="#ffd700" stroke-width="2.2"/>`;
        case 'estrela': return `<path d="M${x},${y + 1} l2,4.2 4.6,.6 -3.3,3.2 .8,4.6 -4.1,-2.2 -4.1,2.2 .8,-4.6 -3.3,-3.2 4.6,-.6 Z" fill="#ffd700"/>`;
        case 'cristal': return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 5}" stroke="#c0c0d0" stroke-width="1.2"/>
                                <path d="M${x},${y + 5} l3.5,5 -3.5,5 -3.5,-5 Z" fill="#00e5ff"/>`;
        default: return '';
      }
    }).join('');
  }

  function ringLayer(a, B) {
    if (!a.ring || a.ring === 'nenhum') return '';
    const [x, y] = B.handR;
    const col = { prata: '#d4d8e0', ouro: '#ffd700', rubi: '#ffd700' }[a.ring];
    let s = `<path d="M${x - 5},${y - 2} q5,4 10,0" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (a.ring === 'rubi') s += `<path d="M${x},${y - 5} l3,3 -3,3 -3,-3 Z" fill="#e11d48" stroke="#fff" stroke-width=".6"/>`;
    return s;
  }

  /** Retorna o markup SVG completo do personagem. opts.viewBox recorta uma região (para miniaturas). */
  function svg(avatar, opts = {}) {
    const a = Object.assign({}, DEFAULT_AVATAR[avatar?.base === 'f' ? 'f' : 'm'], avatar || {});
    const uid = 'av' + (++uidCounter);
    const B = body(a);
    const skin = colorOf('skin', a.skin);
    const skinDk = shade(skin, -0.12);
    const hc = colorOf('hairColor', a.hairColor);
    const browC = a.hair === 'careca' ? shade(skin, -0.5) : hc;
    const vb = opts.viewBox || '0 -14 200 314';

    const arm = (sh, hd) => `<line x1="${sh[0]}" y1="${sh[1]}" x2="${hd[0]}" y2="${hd[1]}" stroke="${skin}" stroke-width="15" stroke-linecap="round"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Personagem" class="${opts.cls || ''}">
      ${hairBack(a, hc)}
      <!-- pernas -->
      <rect x="77" y="196" width="21" height="70" rx="8" fill="${skin}"/>
      <rect x="102" y="196" width="21" height="70" rx="8" fill="${skin}"/>
      ${pantsLayer(a, skin)}
      ${shoesLayer(a)}
      <!-- braços -->
      ${arm(B.shoulderL, B.handL)}${arm(B.shoulderR, B.handR)}
      <!-- tronco -->
      <path d="${B.torso}" fill="${skin}"/>
      ${sleeves(a, B)}
      <rect x="92" y="108" width="16" height="20" rx="4" fill="${skinDk}"/>
      ${topLayer(a, B, skin)}
      ${a.top !== 'regata' && !TOPS[a.top]?.collar && !TOPS[a.top]?.jacket
        ? `<path d="M91,124 Q100,133 109,124 Z" fill="${skinDk}"/>` : ''}
      <!-- mãos -->
      <circle cx="${B.handL[0]}" cy="${B.handL[1]}" r="8.5" fill="${skin}"/>
      <circle cx="${B.handR[0]}" cy="${B.handR[1]}" r="8.5" fill="${skin}"/>
      ${ringLayer(a, B)}
      <!-- cabeça -->
      <circle cx="61" cy="84" r="8" fill="${skin}"/><circle cx="139" cy="84" r="8" fill="${skin}"/>
      <circle cx="61" cy="84" r="4" fill="${skinDk}"/><circle cx="139" cy="84" r="4" fill="${skinDk}"/>
      <circle cx="100" cy="78" r="40" fill="${skin}"/>
      ${eyes(a, skin, uid)}
      <path d="M77,${a.eyes === 'brilhantes' ? 70 : 72} Q85,67 93,71 M107,71 Q115,67 123,${a.eyes === 'brilhantes' ? 70 : 72}"
        stroke="${browC}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M98,92 Q100,95 102,92" stroke="${skinDk}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="78" cy="97" rx="6" ry="3.2" fill="#ff6b8a" opacity=".22"/>
      <ellipse cx="122" cy="97" rx="6" ry="3.2" fill="#ff6b8a" opacity=".22"/>
      <path d="M92,101 Q100,108 108,101" stroke="${B.f ? '#b8435a' : '#7a3b2e'}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      ${hairFront(a, hc)}
      ${earringLayer(a)}
      ${hatLayer(a)}
    </svg>`;
  }

  // Região de recorte das miniaturas por categoria
  const THUMB_VIEW = {
    base: '20 -6 160 300', eyes: '72 68 56 32', hair: '36 -4 128 128', hat: '36 -8 128 108',
    earrings: '42 72 38 38', top: '40 104 120 100', pants: '50 184 100 100', shoes: '58 238 84 48',
    ring: null, // depende do corpo; calculado abaixo
  };
  function thumbViewBox(cat, avatar) {
    if (cat === 'ring') return avatar.base === 'f' ? '121 181 34 34' : '130 184 34 34';
    return THUMB_VIEW[cat] || '0 0 200 300';
  }

  // ── Carteira / perfil ─────────────────────────────────────────────────────
  function key(cat, id) { return `${cat}:${id}`; }

  function getState(username) {
    const u = DB.getUser(username);
    if (!u) return null;
    const base = u.avatar?.base === 'f' ? 'f' : 'm';
    return {
      blooms: u.blooms || 0,
      avatar: Object.assign({}, DEFAULT_AVATAR[base], u.avatar || {}),
      owned: new Set(u.owned || []),
    };
  }

  function isOwned(state, cat, id) {
    const it = getItem(cat, id);
    return !!it && (it.price === 0 || state.owned.has(key(cat, id)));
  }

  /** Equipa um item já possuído. */
  function equip(username, cat, id) {
    return DB.updateUser(username, u => {
      const st = { owned: new Set(u.owned || []) };
      if (!isOwned(st, cat, id)) throw new Error('Item não desbloqueado');
      const base = u.avatar?.base === 'f' ? 'f' : 'm';
      u.avatar = Object.assign({}, DEFAULT_AVATAR[base], u.avatar || {}, { [cat]: id });
    });
  }

  /** Compra (debita blooms), desbloqueia e equipa. Retorna {ok, reason}. */
  function buy(username, cat, id) {
    const it = getItem(cat, id);
    if (!it) return { ok: false, reason: 'Item inexistente.' };
    let result = { ok: true };
    DB.updateUser(username, u => {
      const owned = new Set(u.owned || []);
      if (it.price > 0 && !owned.has(key(cat, id))) {
        if ((u.blooms || 0) < it.price) { result = { ok: false, reason: 'Blooms insuficientes.' }; return; }
        u.blooms = (u.blooms || 0) - it.price;
        owned.add(key(cat, id));
        u.owned = [...owned];
        u.purchases = (u.purchases || []).concat({ item: key(cat, id), price: it.price, ts: Date.now() });
      }
      const base = u.avatar?.base === 'f' ? 'f' : 'm';
      u.avatar = Object.assign({}, DEFAULT_AVATAR[base], u.avatar || {}, { [cat]: id });
    });
    return result;
  }

  // ── Troféus ───────────────────────────────────────────────────────────────
  const TROPHY_LEVEL = 'Entender'; // "Compreender" na tradução mais comum da taxonomia revisada
  const TROPHIES = [
    { id: 'madeira', name: 'Madeira', need: 10, c1: '#6b4423', c2: '#c68a4e' },
    { id: 'ferro',   name: 'Ferro',   need: 20, c1: '#4b5563', c2: '#b8bec7' },
    { id: 'bronze',  name: 'Bronze',  need: 30, c1: '#8a4b1f', c2: '#e3a064' },
    { id: 'prata',   name: 'Prata',   need: 40, c1: '#8a93a3', c2: '#f1f5f9' },
    { id: 'ouro',    name: 'Ouro',    need: 50, c1: '#b8860b', c2: '#ffe066' },
  ];

  function countCorrectAt(username, level = TROPHY_LEVEL) {
    let n = 0;
    DB.getSessions().forEach(s => {
      if (s.username !== username) return;
      (s.attempts || []).forEach(a => { if (a.correct && a.bloomLevel === level) n++; });
    });
    return n;
  }

  function trophySvg(t, unlocked) {
    const g = 'tg' + t.id + (++uidCounter);
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${t.c2}"/><stop offset="1" stop-color="${t.c1}"/></linearGradient></defs>
      <g ${unlocked ? '' : 'opacity=".28" filter="grayscale(1)"'}>
        <path d="M30,24 Q16,24 18,38 Q20,50 34,52" stroke="url(#${g})" stroke-width="6" fill="none"/>
        <path d="M70,24 Q84,24 82,38 Q80,50 66,52" stroke="url(#${g})" stroke-width="6" fill="none"/>
        <path d="M28,16 L72,16 L68,50 Q50,66 32,50 Z" fill="url(#${g})"/>
        <rect x="45" y="60" width="10" height="14" fill="url(#${g})"/>
        <rect x="32" y="74" width="36" height="10" rx="2" fill="url(#${g})"/>
        <rect x="28" y="84" width="44" height="6" rx="2" fill="${t.c1}"/>
        <path d="M38,22 Q36,38 42,48" stroke="#fff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>
      </g>
      ${unlocked ? '' : `<g transform="translate(50 42)"><rect x="-8" y="-2" width="16" height="13" rx="2.5" fill="#6b6090"/>
        <path d="M-5,-2 v-4 a5,5 0 0 1 10,0 v4" stroke="#6b6090" stroke-width="2.6" fill="none"/></g>`}
    </svg>`;
  }

  return {
    CATALOG, TABS, DEFAULT_AVATAR, TROPHIES, TROPHY_LEVEL,
    getItem, svg, thumbViewBox, getState, isOwned, equip, buy,
    countCorrectAt, trophySvg,
  };
})();
