const SYMBOLS = {
  // Furniture
  sofa_3seat: { icon: '🛋️', name: 'Sofá 3 Lugares', w: 200, h: 90, svg: '<rect width="200" height="90" rx="8" fill="#e0e0e0" stroke="#999"/><rect x="25" y="10" width="50" height="70" rx="5" fill="#ccc"/><rect x="85" y="10" width="50" height="70" rx="5" fill="#ccc"/><rect x="145" y="10" width="30" height="70" rx="5" fill="#ccc"/>' },
  bed_casal: { icon: '🛏️', name: 'Cama Casal', w: 160, h: 200, svg: '<rect width="160" height="200" rx="4" fill="#e8e0d8" stroke="#999"/><rect x="0" y="0" width="160" height="30" rx="4" fill="#d4c8b8"/><rect x="10" y="60" width="60" height="50" rx="4" fill="#f5f0e8"/><rect x="90" y="60" width="60" height="50" rx="4" fill="#f5f0e8"/>' },
  dining_table: { icon: '🍽️', name: 'Mesa Jantar', w: 120, h: 200, svg: '<rect x="10" y="10" width="100" height="180" rx="6" fill="#d4a574" stroke="#999"/><circle cx="30" cy="40" r="8" fill="#bbb"/><circle cx="90" cy="40" r="8" fill="#bbb"/><circle cx="30" cy="100" r="8" fill="#bbb"/><circle cx="90" cy="100" r="8" fill="#bbb"/><circle cx="30" cy="160" r="8" fill="#bbb"/><circle cx="90" cy="160" r="8" fill="#bbb"/>' },
  chair: { icon: '🪑', name: 'Cadeira', w: 45, h: 45, svg: '<rect x="5" y="5" width="35" height="35" rx="4" fill="#d4a574" stroke="#999"/>' },
  desk: { icon: '💼', name: 'Mesa Escritório', w: 120, h: 60, svg: '<rect width="120" height="60" rx="3" fill="#d4a574" stroke="#999"/><rect x="40" y="5" width="40" height="25" rx="2" fill="#bbb"/>' },

  // Kitchen
  stove: { icon: '🍳', name: 'Fogão', w: 60, h: 60, svg: '<rect width="60" height="60" rx="4" fill="#888" stroke="#999"/><circle cx="20" cy="20" r="10" fill="#333"/><circle cx="40" cy="20" r="10" fill="#333"/><circle cx="20" cy="40" r="10" fill="#333"/><circle cx="40" cy="40" r="10" fill="#333"/>' },
  sink: { icon: '🚿', name: 'Pia Cozinha', w: 80, h: 60, svg: '<rect width="80" height="60" rx="4" fill="#ccc" stroke="#999"/><rect x="10" y="10" width="30" height="40" rx="4" fill="#fff"/><rect x="45" y="10" width="25" height="40" rx="4" fill="#fff"/>' },
  fridge: { icon: '🧊', name: 'Geladeira', w: 70, h: 70, svg: '<rect width="70" height="70" rx="4" fill="#e8e8e8" stroke="#999"/><rect x="5" y="5" width="60" height="30" rx="2" fill="#f0f0f0"/><rect x="5" y="40" width="60" height="25" rx="2" fill="#f0f0f0"/>' },

  // Bathroom
  toilet: { icon: '🚽', name: 'Vaso Sanitário', w: 40, h: 60, svg: '<rect x="5" y="0" width="30" height="40" rx="8" fill="#fff" stroke="#999"/><ellipse cx="20" cy="50" rx="15" ry="10" fill="#fff" stroke="#999"/>' },
  shower: { icon: '🚿', name: 'Chuveiro', w: 80, h: 80, svg: '<rect width="80" height="80" rx="4" fill="#d6eaf8" stroke="#999"/><circle cx="40" cy="20" r="8" fill="#4a90d9"/><line x1="40" y1="28" x2="40" y2="55" stroke="#4a90d9" stroke-width="2"/><rect x="25" y="55" width="30" height="8" rx="2" fill="#4a90d9"/>' },
  bathtub: { icon: '🛁', name: 'Banheira', w: 75, h: 150, svg: '<rect x="5" y="5" width="65" height="140" rx="20" fill="#fff" stroke="#999"/>' },

  // Electrical
  outlet: { icon: '🔌', name: 'Tomada', w: 8, h: 8, svg: '<circle cx="4" cy="4" r="4" fill="#333"/><circle cx="4" cy="4" r="2" fill="#fff"/>' },
  light_ceiling: { icon: '💡', name: 'Luminária Teto', w: 20, h: 20, svg: '<circle cx="10" cy="10" r="10" fill="none" stroke="#333" stroke-dasharray="3 2"/><circle cx="10" cy="10" r="4" fill="#f5d742" stroke="#333"/>' },

  // Special doors
  balcony_door: { icon: '🚪', name: 'Porta Balcão', w: 80, h: 10, svg: '<line x1="0" y1="0" x2="80" y2="0" stroke="#2d2d2d" stroke-width="3"/><line x1="0" y1="0" x2="0" y2="-40" stroke="#2d2d2d" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M0,-40 A40,40 0 0,1 40,0" fill="none" stroke="#2d2d2d" stroke-width="1.5" stroke-dasharray="4 3"/>' },
};

const SYMBOL_CATEGORIES = [
  { id: 'sym-furniture', label: '🛋️ Móveis', keys: ['sofa_3seat', 'bed_casal', 'dining_table', 'chair', 'desk'] },
  { id: 'sym-kitchen', label: '🍳 Cozinha', keys: ['stove', 'sink', 'fridge'] },
  { id: 'sym-bathroom', label: '🚿 Banheiro', keys: ['toilet', 'shower', 'bathtub'] },
  { id: 'sym-electrical', label: '💡 Elétrica / Portas', keys: ['outlet', 'light_ceiling', 'balcony_door'] }
];

export { SYMBOLS, SYMBOL_CATEGORIES };
