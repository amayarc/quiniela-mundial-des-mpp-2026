// ========= App principal =========
let DATA = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('data.json?v=' + Date.now());
    DATA = await res.json();
    initTabs();
    initSubTabs();
    renderHeaderPills();
    renderClasificacion();
    renderPartidos();
    renderPorPersona();
    renderBonus();
    renderDuelos();
  } catch (e) {
    console.error('Error cargando data.json:', e);
    document.querySelector('main').innerHTML =
      '<div style="text-align:center;padding:40px;color:#C44E15;">' +
      '<h2>⚠️ No se pudo cargar los datos</h2>' +
      '<p>Revisa que <code>data.json</code> esté en el repo.</p></div>';
  }
});

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

function initSubTabs() {
  document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.sub;
      btn.parentElement.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sub-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('bonus-' + sub + '-content').classList.add('active');
    });
  });
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

  const partidos = DATA.partidos.filter(p => !filtroDia || p.fecha === filtroDia);
  // Agrupar por día
  const byDay = {};
  partidos.forEach(p => {
    if (!byDay[p.fecha]) byDay[p.fecha] = [];
    byDay[p.fecha].push(p);
  });

  cont.innerHTML = Object.entries(byDay).map(([dia, list]) => `
    <div class="partidos-day">
      <h3>${dia}</h3>
      ${list.map(p => renderPartidoCard(p)).join('')}
    </div>
  `).join('');

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

// ========= Bonus (Campeón / Goleador) =========
function renderBonus() {
  renderBonusList('campeon', 'campeon');
  renderBonusList('goleador', 'goleador');
}

function renderBonusList(tipo, key) {
  const cont = document.getElementById(`bonus-${tipo}-content`);
  // Agrupar por valor
  const groups = {};
  DATA.bonus.forEach(b => {
    const v = (b[key] || '— sin selección —').trim();
    if (!groups[v]) groups[v] = [];
    groups[v].push(b.nombre);
  });
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  cont.innerHTML = `
    <div class="votos-grid">
      ${sorted.map(([equipo, personas]) => `
        <div class="voto-card">
          <div class="voto-equipo">${escapeHtml(equipo)}</div>
          <div class="voto-count">${personas.length} voto${personas.length === 1 ? '' : 's'}</div>
          <div class="voto-personas">${personas.map(escapeHtml).join(', ')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ========= Duelos =========
function renderDuelos() {
  const cont = document.getElementById('duelos-list');
  cont.innerHTML = DATA.duelos.map(d => {
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
  }).join('');
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
