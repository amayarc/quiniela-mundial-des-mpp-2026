// ========= App principal =========
const FIREBASE_URL = "https://quiniela-des-mpp-2026-default-rtdb.firebaseio.com";
let DATA = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Cargar base estática (predicciones, bonus picks, duelos asignados)
    const res = await fetch('data.json?v=' + Date.now());
    DATA = await res.json();

    // 2. Cargar resultados "vivos" desde Firebase (sobreescriben los del JSON)
    try {
      const fbRes = await fetch(FIREBASE_URL + '/live.json?_=' + Date.now());
      if (fbRes.ok) {
        const fb = await fbRes.json();
        if (fb) {
          if (fb.resultados) {
            Object.entries(fb.resultados).forEach(([num, r]) => {
              const p = DATA.partidos.find(x => x.num === Number(num));
              if (p) {
                p.gol_local = (r.l != null) ? Number(r.l) : null;
                p.gol_visit = (r.v != null) ? Number(r.v) : null;
                p.jugado = p.gol_local != null && p.gol_visit != null;
              }
            });
          }
          DATA.meta.campeon_real  = fb.campeon_real  || null;
          DATA.meta.goleador_real = fb.goleador_real || null;
          if (fb.bota_de_oro !== undefined) DATA.meta.bota_de_oro = fb.bota_de_oro;
        }
      }
    } catch (fbErr) {
      console.warn('No se pudo leer Firebase, usando solo JSON:', fbErr);
    }

    // 3. Recalcular puntos y clasificación
    recalcularTodo(DATA);

    initTabs();
    initSubTabs();
    renderHeaderPills();
    renderClasificacion();
    renderPartidos();
    renderPorPersona();
    renderCampeon();
    renderBotaActual();
    renderGoleador();
    renderDuelos();
    initCapturar();
  } catch (e) {
    console.error('Error cargando data.json:', e);
    document.querySelector('main').innerHTML =
      '<div style="text-align:center;padding:40px;color:#C44E15;">' +
      '<h2>⚠️ No se pudo cargar los datos</h2>' +
      '<p>Revisa que <code>data.json</code> esté en el repo.</p></div>';
  }
});

// ========= Recalcular puntos y clasificación =========
function recalcularTodo(data) {
  data.meta.partidos_jugados = data.partidos.filter(p => p.jugado).length;

  const stats = {};
  data.participantes.forEach(p => {
    stats[p.slot] = { nombre: p.nombre, pts_partidos: 0, pts_bonus: 0, pts_duelos: 0,
                      marcadores_exactos: 0, ganadores_correctos: 0, fallos: 0 };
  });

  // Partidos
  data.predicciones.forEach(grupo => {
    const partido = data.partidos.find(x => x.num === grupo.partido_num);
    if (!partido) return;
    grupo.predicciones.forEach(pr => {
      const pts = calcPtsPartido(pr.local, pr.visitante, partido.gol_local, partido.gol_visit);
      pr.pts = pts;
      if (pts === 3) { stats[pr.slot].marcadores_exactos++; stats[pr.slot].pts_partidos += 3; }
      else if (pts === 1) { stats[pr.slot].ganadores_correctos++; stats[pr.slot].pts_partidos += 1; }
      else if (pts === 0) { stats[pr.slot].fallos++; }
    });
  });

  // Bonus
  data.bonus.forEach(b => {
    b.pts_campeon  = calcPtsBonus(b.campeon,  data.meta.campeon_real,  10);
    b.pts_goleador = calcPtsBonus(b.goleador, data.meta.goleador_real, 5);
    if (b.pts_campeon)  stats[b.slot].pts_bonus += b.pts_campeon;
    if (b.pts_goleador) stats[b.slot].pts_bonus += b.pts_goleador;
  });

  // Duelos
  data.duelos.forEach(d => {
    const part = data.partidos.find(x => x.num === d.partido_num);
    if (part && part.jugado) {
      const gl = part.gol_local, gv = part.gol_visit;
      if (gl > gv) { d.pts_a = 2; d.pts_b = 0; d.ganador = 'A'; }
      else if (gl < gv) { d.pts_a = 0; d.pts_b = 2; d.ganador = 'B'; }
      else { d.pts_a = 0; d.pts_b = 0; d.ganador = 'empate'; }
      d.estado = 'ya_jugado';
      const slotA = data.participantes.find(p => p.nombre === d.persona_a)?.slot;
      const slotB = data.participantes.find(p => p.nombre === d.persona_b)?.slot;
      if (slotA && d.pts_a) stats[slotA].pts_duelos += d.pts_a;
      if (slotB && d.pts_b) stats[slotB].pts_duelos += d.pts_b;
    } else {
      d.pts_a = d.pts_b = null;
      d.ganador = null;
      d.estado = 'pendiente';
    }
  });

  // Clasificación
  data.clasificacion = Object.entries(stats).map(([slot, s]) => ({
    slot: Number(slot),
    nombre: s.nombre,
    pts_total: s.pts_partidos + s.pts_bonus + s.pts_duelos,
    pts_partidos: s.pts_partidos,
    pts_bonus: s.pts_bonus,
    pts_duelos: s.pts_duelos,
    marcadores_exactos: s.marcadores_exactos,
    ganadores_correctos: s.ganadores_correctos,
    fallos: s.fallos,
  }));
  data.clasificacion.sort((a, b) =>
    (b.pts_total - a.pts_total) ||
    (b.marcadores_exactos - a.marcadores_exactos) ||
    (a.slot - b.slot)
  );
  data.clasificacion.forEach((c, i) => c.pos = i + 1);
}

// ========= Tabs =========
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      window.scrollTo(0, 0);
    });
  });
}

function initSubTabs() { /* legacy - ya no se usa */ }

// Mapping país → emoji de bandera (para Campeón y Goleador)
const FLAGS = {
  'España': '🇪🇸', 'Espana': '🇪🇸',
  'Francia': '🇫🇷',
  'Brasil': '🇧🇷',
  'Noruega': '🇳🇴',
  'Inglaterra': 'ENG', 'Escocia': 'SCO', 'Gales': 'WAL', 'Reino Unido': '🇬🇧',
  'Argentina': '🇦🇷',
  'México': '🇲🇽', 'Mexico': '🇲🇽',
  'Portugal': '🇵🇹',
  'Alemania': '🇩🇪',
  'Países Bajos': '🇳🇱', 'Holanda': '🇳🇱',
  'Italia': '🇮🇹',
  'Uruguay': '🇺🇾',
  'Colombia': '🇨🇴',
};
// Jugador → país (para mostrar bandera)
const GOLEADOR_PAIS = {
  'Kylian Mbappé': 'Francia',
  'Erling Haaland': 'Noruega',
  'Vinícius Júnior': 'Brasil',
  'Endrick': 'Brasil',
  'Lamine Yamal': 'España',
  'Harry Kane': 'Inglaterra',
  'Ousmane Dembélé': 'Francia',
  'Julián Álvarez': 'Argentina',
};
// Colores por equipo (fijos, basados en la identidad del país)
const TEAM_COLORS = {
  'España':       '#C62828', // rojo
  'Francia':      '#1565C0', // azul
  'Brasil':       '#2E7D32', // verde
  'Argentina':    '#5BAEE0', // celeste
  'Alemania':     '#212121', // negro
  'Inglaterra':   '#E53935',
  'Portugal':     '#8E0F0F',
  'Países Bajos': '#F26522', // naranja
  'México':       '#0F9D58',
  'Italia':       '#0D47A1',
  'Uruguay':      '#4FC3F7',
  'Colombia':     '#FFC107',
};
const FALLBACK_COLORS = ['#F57C00', '#6A1B9A', '#00838F', '#AD1457', '#558B2F'];
function colorEquipo(equipo, fallbackIdx = 0) {
  return TEAM_COLORS[equipo] || FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
}

function flag(equipo) { return FLAGS[equipo] || '🏳️'; }

function getHoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ========= Header pills =========
function renderHeaderPills() {
  document.getElementById('pill-jugados').textContent =
    `${DATA.meta.partidos_jugados}/${DATA.meta.total_partidos} jugados`;
  document.getElementById('pill-participantes').textContent =
    `${DATA.meta.total_participantes} quinielas`;
}

// ========= Clasificación =========
function renderClasificacion() {
  const podiumEl = document.getElementById('clasif-podium');
  const tbody = document.getElementById('clasif-tbody');
  const updEl = document.getElementById('updated-text');

  updEl.textContent = `${DATA.meta.partidos_jugados} de ${DATA.meta.total_partidos} partidos jugados`;

  // Top 3 podio
  const top3 = DATA.clasificacion.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const colors = ['gold', 'silver', 'bronze'];
  podiumEl.innerHTML = top3.map((c, i) => `
    <div class="podium-card ${colors[i]}">
      <div class="podium-medal">${medals[i]}</div>
      <div class="podium-name">${escapeHtml(c.nombre)}</div>
      <div class="podium-pts">${c.pts_total}</div>
      <div class="podium-sub">${c.marcadores_exactos} exactos · ${c.ganadores_correctos} aciertos</div>
    </div>
  `).join('');

  // Tabla completa
  tbody.innerHTML = DATA.clasificacion.map(c => {
    const cls = c.pos <= 3 ? `pos-${c.pos}` : '';
    return `
      <tr class="${cls}">
        <td>${c.pos}</td>
        <td>${escapeHtml(c.nombre)}</td>
        <td class="total">${c.pts_total}</td>
        <td class="hide-mobile center">${c.pts_partidos}</td>
        <td class="hide-mobile center">${c.pts_bonus}</td>
        <td class="hide-mobile center">${c.pts_duelos}</td>
        <td class="hide-mobile center">${c.marcadores_exactos}</td>
        <td class="hide-mobile center">${c.ganadores_correctos}</td>
      </tr>
    `;
  }).join('');
}

// ========= Partidos =========
function renderPartidos(filtroDia = '') {
  const cont = document.getElementById('partidos-list');
  const filtroEl = document.getElementById('filtro-dia');

  // Llenar el filtro de día solo la primera vez
  if (filtroEl.options.length <= 1) {
    const dias = [...new Set(DATA.partidos.map(p => p.fecha))];
    dias.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      filtroEl.appendChild(opt);
    });
    filtroEl.addEventListener('change', e => renderPartidos(e.target.value));
  }

  const hoy = getHoyIso();
  const partidos = DATA.partidos.filter(p => !filtroDia || p.fecha === filtroDia);

  // Si hay filtro de día, no priorizamos HOY
  const partidosHoy = filtroDia ? [] : partidos.filter(p => p.fecha_iso === hoy);
  const partidosResto = filtroDia ? partidos : partidos.filter(p => p.fecha_iso !== hoy);

  // Agrupar el resto por día y ordenar cronológicamente
  const byDay = {};
  partidosResto.forEach(p => {
    const k = p.fecha || 'Sin fecha';
    if (!byDay[k]) byDay[k] = { iso: p.fecha_iso || '', label: k, list: [] };
    byDay[k].list.push(p);
  });
  const grupos = Object.values(byDay).sort((a, b) => (a.iso || '').localeCompare(b.iso || ''));

  let html = '';
  if (partidosHoy.length > 0) {
    html += `
      <div class="partidos-day day-today">
        <h3>📍 HOY · ${partidosHoy[0].fecha}</h3>
        ${partidosHoy.map(p => renderPartidoCard(p, true)).join('')}
      </div>
    `;
  }
  html += grupos.map(g => `
    <div class="partidos-day">
      <h3>${g.label}</h3>
      ${g.list.map(p => renderPartidoCard(p, false)).join('')}
    </div>
  `).join('');
  cont.innerHTML = html;

  // Click handlers para expandir
  cont.querySelectorAll('.partido-card').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('open'));
  });
}

function renderPartidoCard(p) {
  const score = p.jugado
    ? `<div class="partido-score">${p.gol_local} - ${p.gol_visit}</div>`
    : `<div class="partido-score pending">Por jugar</div>`;
  const preds = DATA.predicciones.find(x => x.partido_num === p.num)?.predicciones || [];
  return `
    <div class="partido-card">
      <div class="partido-head">
        <span class="partido-info">${p.grupo} · ${p.hora} · ${escapeHtml(p.estadio)}</span>
        <span class="partido-info">P${p.num}</span>
      </div>
      <div class="partido-teams">
        <div class="partido-team local">${escapeHtml(p.local)}</div>
        ${score}
        <div class="partido-team visit">${escapeHtml(p.visitante)}</div>
      </div>
      <div class="partido-detail">
        <strong style="color:var(--blue)">Predicciones (${preds.length}):</strong>
        <div class="pred-grid">
          ${preds.map(pr => renderPredItem(pr, p.jugado)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderPredItem(pr, jugado) {
  let cls = '';
  if (jugado) {
    if (pr.pts === 3) cls = 'exact';
    else if (pr.pts === 1) cls = 'partial';
    else cls = 'fail';
  }
  const score = (pr.local !== null && pr.visitante !== null) ? `${pr.local}-${pr.visitante}` : '—';
  const ptsBadge = jugado ? `<span class="pred-pts">${pr.pts ?? 0}</span>` : '';
  return `
    <div class="pred-item ${cls}">
      <span class="pred-name">${escapeHtml(pr.nombre)}</span>
      <span class="pred-score">${score}</span>
      ${ptsBadge}
    </div>
  `;
}

// ========= Por persona =========
function renderPorPersona() {
  const sel = document.getElementById('select-persona');
  DATA.participantes.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.slot; opt.textContent = p.nombre;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', e => renderPersonaDetalle(Number(e.target.value)));
  renderPersonaDetalle(DATA.participantes[0].slot);
}

function renderPersonaDetalle(slot) {
  const c = DATA.clasificacion.find(x => x.slot === slot);
  const b = DATA.bonus.find(x => x.slot === slot);
  const cont = document.getElementById('persona-detalle');
  const preds = DATA.partidos.map(p => {
    const pred = DATA.predicciones.find(x => x.partido_num === p.num)
                  ?.predicciones.find(x => x.slot === slot);
    return { partido: p, pred };
  });

  const headerHtml = `
    <div class="persona-header">
      <div class="persona-name">${escapeHtml(c.nombre)}</div>
      <div class="persona-stats">
        <div class="persona-stat"><div class="num">#${c.pos}</div><div class="lbl">Posición</div></div>
        <div class="persona-stat"><div class="num">${c.pts_total}</div><div class="lbl">Total pts</div></div>
        <div class="persona-stat"><div class="num">${c.marcadores_exactos}</div><div class="lbl">Exactos</div></div>
        <div class="persona-stat"><div class="num">${c.ganadores_correctos}</div><div class="lbl">Aciertos</div></div>
        <div class="persona-stat"><div class="num">${c.pts_duelos}</div><div class="lbl">Pts duelos</div></div>
      </div>
      <div class="persona-bonus">
        <div>🏆 Campeón<br><strong>${escapeHtml(b?.campeon || '—')}</strong><small>${b?.pts_campeon !== null ? '(' + (b?.pts_campeon || 0) + ' pts)' : 'pendiente'}</small></div>
        <div>⚽ Goleador<br><strong>${escapeHtml(b?.goleador || '—')}</strong><small>${b?.pts_goleador !== null ? '(' + (b?.pts_goleador || 0) + ' pts)' : 'pendiente'}</small></div>
      </div>
    </div>
  `;

  // Agrupar predicciones por día
  const byDay = {};
  preds.forEach(({partido, pred}) => {
    if (!byDay[partido.fecha]) byDay[partido.fecha] = [];
    byDay[partido.fecha].push({partido, pred});
  });

  const daysHtml = Object.entries(byDay).map(([dia, list]) => `
    <div class="partidos-day">
      <h3>${dia}</h3>
      ${list.map(({partido, pred}) => renderPersonaPartido(partido, pred)).join('')}
    </div>
  `).join('');

  cont.innerHTML = headerHtml + daysHtml;
}

function renderPersonaPartido(partido, pred) {
  const real = partido.jugado ? `${partido.gol_local}-${partido.gol_visit}` : 'Por jugar';
  const tu = (pred && pred.local !== null) ? `${pred.local}-${pred.visitante}` : '—';
  let cls = '', ptsBadge = '';
  if (partido.jugado && pred) {
    if (pred.pts === 3) { cls = 'exact'; ptsBadge = '<span class="pred-pts">3</span>'; }
    else if (pred.pts === 1) { cls = 'partial'; ptsBadge = '<span class="pred-pts">1</span>'; }
    else { cls = 'fail'; ptsBadge = '<span class="pred-pts">0</span>'; }
  }
  return `
    <div class="partido-card">
      <div class="partido-head">
        <span class="partido-info">${partido.grupo} · ${partido.hora} · P${partido.num}</span>
        ${ptsBadge}
      </div>
      <div class="partido-teams">
        <div class="partido-team local">${escapeHtml(partido.local)}</div>
        <div class="partido-score ${partido.jugado ? '' : 'pending'}">${tu}</div>
        <div class="partido-team visit">${escapeHtml(partido.visitante)}</div>
      </div>
      <div style="text-align:center;margin-top:8px;font-size:0.85rem;color:var(--muted);">
        Real: <strong>${real}</strong>
      </div>
    </div>
  `;
}

// ========= Campeón =========
function renderCampeon() {
  const groups = {};
  DATA.bonus.forEach(b => {
    const v = (b.campeon || '— sin selección —').trim();
    if (!groups[v]) groups[v] = [];
    groups[v].push(b.nombre);
  });
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  const total = DATA.bonus.length;

  // Pie chart con conic-gradient (colores fijos por equipo)
  let accum = 0;
  let fallbackI = 0;
  const colorOf = (eq) => TEAM_COLORS[eq] || FALLBACK_COLORS[fallbackI++ % FALLBACK_COLORS.length];
  const stops = sorted.map(([equipo, personas]) => {
    const pct = personas.length / total * 100;
    const start = accum;
    accum += pct;
    return `${colorOf(equipo)} ${start}% ${accum}%`;
  }).join(', ');

  // Detectar empates para mostrar "empate técnico"
  const counts = sorted.map(([_, p]) => p.length);
  const maxCount = counts[0];
  const empateMax = counts.filter(c => c === maxCount).length > 1;

  document.getElementById('campeon-pie').innerHTML = `
    <div class="pie-chart" style="background: conic-gradient(${stops});"></div>
    <div class="pie-list">
      ${sorted.map(([equipo, personas]) => {
        const pct = (personas.length / total * 100).toFixed(1);
        const isMax = personas.length === maxCount && empateMax;
        const col = colorEquipo(equipo);
        return `<div class="pie-row">
          <span class="dot" style="background:${col}"></span>
          <span class="flag-big">${flag(equipo)}</span>
          <div class="info">
            <div class="equipo">${escapeHtml(equipo)}</div>
            <div class="votos">${personas.length} voto${personas.length === 1 ? '' : 's'}${isMax ? ' · empate técnico' : ''}</div>
          </div>
          <div class="pct" style="color:${col}">${pct}%</div>
        </div>`;
      }).join('')}
    </div>
  `;

  // Detalle: quiénes votaron por cada equipo
  document.getElementById('campeon-detalle').innerHTML = `
    <div class="campeon-detalle-title">Quiénes votaron por cada equipo</div>
    ${sorted.map(([equipo, personas]) => `
      <div class="campeon-detalle-row" style="border-left-color: ${colorEquipo(equipo)};">
        <span class="flag-md">${flag(equipo)}</span>
        <span class="equipo-nombre">${escapeHtml(equipo)}</span>
        <span class="personas">${personas.map(escapeHtml).join(', ')}</span>
      </div>
    `).join('')}
  `;
}

// ========= Bota de Oro · líder actual real =========
function renderBotaActual() {
  const cont = document.getElementById('bota-actual');
  if (!cont) return;
  const bota = DATA.meta.bota_de_oro;
  if (!bota || !bota.lideres || bota.lideres.length === 0 || !bota.goles) {
    cont.innerHTML = '';
    return;
  }
  const n = bota.lideres.length;
  const statsTxt = n > 1 ? `${n} jugadores empatados` : '1 jugador en la cima';
  cont.innerHTML = `
    <div class="bota-actual-head">
      <span class="bota-actual-title">🥇 Bota de Oro · Líder real del Mundial</span>
      <span class="bota-actual-stats">${statsTxt}</span>
    </div>
    <div class="bota-actual-goles">
      ${bota.goles} <small>gol${bota.goles === 1 ? '' : 'es'}</small>
    </div>
    ${bota.lideres.map(l => `
      <div class="bota-lider-row">
        <span class="bota-lider-flag">${flag(l.pais)}</span>
        <span class="bota-lider-name">${escapeHtml(l.nombre)}</span>
        <span class="bota-lider-pais">${escapeHtml(l.pais)}</span>
      </div>
    `).join('')}
    ${bota.actualizado ? `<div class="bota-actual-footer">Actualizado: ${escapeHtml(bota.actualizado)}</div>` : ''}
  `;
}

// ========= Goleador =========
function renderGoleador() {
  const groups = {};
  DATA.bonus.forEach(b => {
    const v = (b.goleador || '— sin selección —').trim();
    if (!groups[v]) groups[v] = [];
    groups[v].push(b.nombre);
  });
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  // Podio top 3 con orden visual: 2°, 1°, 3°
  const top3 = sorted.slice(0, 3);
  const visualOrder = [];
  if (top3[1]) visualOrder.push({ rank: 2, data: top3[1] });
  if (top3[0]) visualOrder.push({ rank: 1, data: top3[0] });
  if (top3[2]) visualOrder.push({ rank: 3, data: top3[2] });

  document.getElementById('goleador-podium').innerHTML = visualOrder.map(({ rank, data }) => {
    const [jugador, personas] = data;
    const pais = GOLEADOR_PAIS[jugador] || '';
    const flagEmoji = pais ? flag(pais) : '⚽';
    return `
      <div class="podio-spot rank-${rank}">
        <div class="podio-rank">${rank}</div>
        <div class="podio-flag">${flagEmoji}</div>
        <div class="podio-name">${escapeHtml(jugador)}</div>
        <div class="podio-votes">${personas.length} voto${personas.length === 1 ? '' : 's'}</div>
        <div class="podio-personas">${personas.map(escapeHtml).join(', ')}</div>
      </div>
    `;
  }).join('');

  // Resto (4° en adelante)
  const resto = sorted.slice(3);
  document.getElementById('goleador-resto').innerHTML = resto.map(([jugador, personas], i) => {
    const rank = i + 4;
    const pais = GOLEADOR_PAIS[jugador] || '';
    const flagEmoji = pais ? flag(pais) : '⚽';
    return `
      <div class="resto-card">
        <div class="resto-pos">${rank}°</div>
        <div class="resto-flag">${flagEmoji}</div>
        <div class="resto-name">${escapeHtml(jugador)}</div>
        <div class="resto-votes">${personas.length} voto${personas.length === 1 ? '' : 's'}</div>
        <div class="resto-persona">${personas.map(escapeHtml).join(', ')}</div>
      </div>
    `;
  }).join('');
}

// ========= Duelos =========
function renderDuelos() {
  const cont = document.getElementById('duelos-list');
  const hoy = getHoyIso();

  // Enriquecer cada duelo con fecha del partido y ordenar
  const duelos = DATA.duelos.map(d => {
    const p = DATA.partidos.find(x => x.num === d.partido_num);
    return { ...d, fecha_iso: p?.fecha_iso || '', fecha: p?.fecha || '' };
  });
  duelos.sort((a, b) => {
    const aHoy = a.fecha_iso === hoy ? 0 : 1;
    const bHoy = b.fecha_iso === hoy ? 0 : 1;
    if (aHoy !== bHoy) return aHoy - bHoy;
    return (a.fecha_iso || '').localeCompare(b.fecha_iso || '');
  });

  // Encabezado "HOY" si aplica
  const hayHoy = duelos.some(d => d.fecha_iso === hoy);

  let html = '';
  let yaHubo = false;
  let yaPasoHoy = false;
  duelos.forEach(d => {
    if (d.fecha_iso === hoy && !yaHubo) {
      html += `<h3 class="duelos-header">📍 HOY · ${d.fecha}</h3>`;
      yaHubo = true;
    } else if (d.fecha_iso !== hoy && !yaPasoHoy) {
      if (hayHoy) html += `<h3 class="duelos-header" style="margin-top:24px;">📅 Resto de la fase</h3>`;
      yaPasoHoy = true;
    }
    html += renderDueloCard(d);
  });

  cont.innerHTML = html;
}

function renderDueloCard(d) {
    const partido = DATA.partidos.find(p => p.num === d.partido_num);
    let estadoTxt = '⏳ Pendiente — partido por jugar';
    let estadoCls = '';
    let aCls = '', bCls = '';
    if (d.estado === 'ya_jugado') {
      estadoCls = 'played';
      if (d.ganador === 'A') {
        estadoTxt = `✅ ${escapeHtml(d.persona_a)} ganó (+2 pts)`;
        aCls = 'winner'; bCls = 'loser';
      } else if (d.ganador === 'B') {
        estadoTxt = `✅ ${escapeHtml(d.persona_b)} ganó (+2 pts)`;
        aCls = 'loser'; bCls = 'winner';
      } else {
        estadoTxt = `🤝 Empate — nadie suma`;
      }
    }
    const scoreStr = partido?.jugado ? ` (${partido.gol_local}-${partido.gol_visit})` : '';
    return `
      <div class="duelo-card">
        <div class="duelo-head">Duelo ${d.num} · Partido ${d.partido_num}${scoreStr}</div>
        <div class="duelo-match">${escapeHtml(d.local)} vs ${escapeHtml(d.visitante)}</div>
        <div class="duelo-vs">
          <div class="duelo-side ${aCls}">
            <div class="side-name">${escapeHtml(d.persona_a)}</div>
            <div class="side-pred">predice: ${escapeHtml(d.local)}</div>
          </div>
          <div class="duelo-vs-text">VS</div>
          <div class="duelo-side ${bCls}">
            <div class="side-name">${escapeHtml(d.persona_b)}</div>
            <div class="side-pred">predice: ${escapeHtml(d.visitante)}</div>
          </div>
        </div>
        <div class="duelo-status ${estadoCls}">${estadoTxt}</div>
      </div>
    `;
}

// ========= Capturar (panel admin) =========
// NOTA: la clave es simple, vive en el código (público). No es seguridad real,
// solo evita que cualquiera capture resultados accidentalmente. Cámbiala editando esta línea.
const ADMIN_PASS = "des2026";

function initCapturar() {
  const btn = document.getElementById('login-btn');
  const pass = document.getElementById('login-pass');
  const err = document.getElementById('login-error');
  if (!btn) return;

  const tryLogin = () => {
    if (pass.value === ADMIN_PASS) {
      document.getElementById('capturar-login').style.display = 'none';
      document.getElementById('capturar-panel').style.display = 'block';
      err.textContent = '';
      renderCapturarPanel();
    } else {
      err.textContent = '❌ Clave incorrecta';
      pass.value = '';
      pass.focus();
    }
  };
  btn.addEventListener('click', tryLogin);
  pass.addEventListener('keypress', e => { if (e.key === 'Enter') tryLogin(); });

  document.getElementById('btn-logout').addEventListener('click', () => {
    document.getElementById('capturar-login').style.display = 'block';
    document.getElementById('capturar-panel').style.display = 'none';
    document.getElementById('login-pass').value = '';
  });
  document.getElementById('capt-filtro').addEventListener('change', renderCapturarPartidos);
  document.getElementById('btn-download').addEventListener('click', descargarJSON);
  document.getElementById('btn-save').addEventListener('click', guardarEnFirebase);
}

// Guarda los resultados directamente en Firebase
async function guardarEnFirebase() {
  if (!CAPT) return;
  const msg = document.getElementById('save-msg');
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  msg.textContent = '⏳ Guardando en la nube...';
  msg.className = 'save-msg pending';

  // Limpiar valores
  CAPT.partidos.forEach(p => {
    if (p.gol_local === '') p.gol_local = null;
    if (p.gol_visit === '') p.gol_visit = null;
  });
  CAPT.meta.campeon_real = (CAPT.meta.campeon_real || '').trim() || null;
  CAPT.meta.goleador_real = (CAPT.meta.goleador_real || '').trim() || null;

  // Procesar Bota de Oro desde inputs
  const goles = parseInt(document.getElementById('capt-bota-goles').value);
  const fecha = document.getElementById('capt-bota-fecha').value || null;
  const lideresTxt = document.getElementById('capt-bota-lideres').value || '';
  const lideres = lideresTxt.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const m = line.split(/\s*[-–—]\s*/);
      return { nombre: (m[0] || '').trim(), pais: (m[1] || '').trim() };
    })
    .filter(l => l.nombre);
  CAPT.meta.bota_de_oro = (goles && lideres.length > 0) ? {
    goles, lideres, actualizado: fecha
  } : null;

  // Payload: solo resultados, bonus y bota de oro
  const payload = {
    resultados:    {},
    campeon_real:  CAPT.meta.campeon_real,
    goleador_real: CAPT.meta.goleador_real,
    bota_de_oro:   CAPT.meta.bota_de_oro,
  };
  CAPT.partidos.forEach(p => {
    if (p.gol_local != null && p.gol_visit != null) {
      payload.resultados[String(p.num)] = { l: p.gol_local, v: p.gol_visit };
    }
  });

  try {
    const res = await fetch(FIREBASE_URL + '/live.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    msg.textContent = '✅ Guardado. Refrescando la web...';
    msg.className = 'save-msg ok';
    // Esperar un momento para que el usuario vea el mensaje, luego recargar
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    msg.textContent = '❌ Error al guardar: ' + e.message;
    msg.className = 'save-msg err';
    btn.disabled = false;
  }
}

// Estado mutable de la captura — clon de DATA que se modifica al ingresar resultados
let CAPT = null;

function renderCapturarPanel() {
  // Inicializar clon mutable
  CAPT = JSON.parse(JSON.stringify(DATA));
  document.getElementById('capt-campeon').value = CAPT.meta.campeon_real || '';
  document.getElementById('capt-goleador').value = CAPT.meta.goleador_real || '';
  document.getElementById('capt-campeon').addEventListener('input', e => {
    CAPT.meta.campeon_real = e.target.value;
  });
  document.getElementById('capt-goleador').addEventListener('input', e => {
    CAPT.meta.goleador_real = e.target.value;
  });

  // Bota de Oro
  const bota = CAPT.meta.bota_de_oro || {};
  document.getElementById('capt-bota-goles').value = bota.goles || '';
  document.getElementById('capt-bota-fecha').value = bota.actualizado || '';
  const lideresTxt = (bota.lideres || []).map(l => `${l.nombre} - ${l.pais}`).join('\n');
  document.getElementById('capt-bota-lideres').value = lideresTxt;

  renderCapturarPartidos();
}

function renderCapturarPartidos() {
  const filtro = document.getElementById('capt-filtro').value;
  const hoy = getHoyIso();
  let lista = CAPT.partidos;
  if (filtro === 'hoy') lista = lista.filter(p => p.fecha_iso === hoy);
  else if (filtro === 'pendientes') lista = lista.filter(p => p.gol_local == null || p.gol_visit == null);

  const cont = document.getElementById('capt-partidos-list');
  if (lista.length === 0) {
    cont.innerHTML = `<p style="color:var(--muted);text-align:center;padding:20px;">No hay partidos para mostrar con este filtro.</p>`;
    return;
  }
  cont.innerHTML = lista.map(p => {
    const hasResult = p.gol_local != null && p.gol_visit != null;
    return `
      <div class="capt-partido ${hasResult ? 'has-result' : ''}" data-num="${p.num}">
        <div class="capt-partido-info">
          <div class="capt-partido-teams">${escapeHtml(p.local)} vs ${escapeHtml(p.visitante)}</div>
          <div class="capt-partido-meta">P${p.num} · ${p.fecha} · ${p.hora} · ${escapeHtml(p.grupo)}</div>
        </div>
        <div class="capt-score-inputs">
          <input type="number" min="0" max="20" value="${p.gol_local ?? ''}" data-num="${p.num}" data-side="L">
          <span class="dash">-</span>
          <input type="number" min="0" max="20" value="${p.gol_visit ?? ''}" data-num="${p.num}" data-side="V">
        </div>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('input[type=number]').forEach(inp => {
    inp.addEventListener('input', e => {
      const num = Number(e.target.dataset.num);
      const side = e.target.dataset.side;
      const val = e.target.value === '' ? null : Math.max(0, Math.min(20, parseInt(e.target.value)));
      const partido = CAPT.partidos.find(x => x.num === num);
      if (partido) {
        if (side === 'L') partido.gol_local = val;
        else partido.gol_visit = val;
        partido.jugado = partido.gol_local != null && partido.gol_visit != null;
        // Marcar visualmente
        const card = e.target.closest('.capt-partido');
        if (card) card.classList.toggle('has-result', partido.jugado);
      }
    });
  });
}

// Descarga JSON como backup local (sin pasar por Firebase)
function descargarJSON() {
  // Limpiar y normalizar
  CAPT.partidos.forEach(p => {
    if (p.gol_local === '') p.gol_local = null;
    if (p.gol_visit === '') p.gol_visit = null;
    p.jugado = p.gol_local != null && p.gol_visit != null;
  });
  CAPT.meta.campeon_real  = (CAPT.meta.campeon_real  || '').trim() || null;
  CAPT.meta.goleador_real = (CAPT.meta.goleador_real || '').trim() || null;

  // Recalcular todo y descargar
  recalcularTodo(CAPT);
  const blob = new Blob([JSON.stringify(CAPT, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function calcPtsPartido(pl, pv, rl, rv) {
  if (pl == null || pv == null || rl == null || rv == null) return null;
  if (pl === rl && pv === rv) return 3;
  const sp = Math.sign(pl - pv), sr = Math.sign(rl - rv);
  return sp === sr ? 1 : 0;
}
function calcPtsBonus(pred, real, valor) {
  if (!real || !String(real).trim()) return null;
  if (!pred || !String(pred).trim()) return 0;
  return String(pred).trim().toLowerCase() === String(real).trim().toLowerCase() ? valor : 0;
}

// ========= Util =========
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
