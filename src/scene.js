
/* ================= the pumpkin: Cycles light passes, mixed live ================= */
const IMG = /*IMAGES*/null;
const screenEl = $('#screen'), stage = $('#stage'), dark = $('#dark'), pkc = $('#pk'), fx = $('#fx'), fctx = fx.getContext('2d');
const pkHit = $('#pkHit'), hint = $('#hint');

const VS = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }`;
const FS = `precision mediump float;
varying vec2 vUv;
uniform sampler2D tU, tC, tL, tR, tB;
uniform float uA, uFlick, uSway, uMorph, uFlare;
vec3 lin(sampler2D t){ return pow(texture2D(t, vUv).rgb, vec3(2.2)); }
void main(){
  vec3 u = lin(tU), c = lin(tC), l = lin(tL), r = lin(tR), b = lin(tB);
  float s = clamp(uSway, -1., 1.);
  vec3 lit = c * (1. - abs(s)) + l * max(-s, 0.) + r * max(s, 0.);
  lit = max(lit + (b - c) * uMorph, 0.);
  float a = clamp(uA, 0., 1.);
  vec3 col = u * (1. - a) + lit * (a * uFlick + uFlare);
  vec2 e = min(vUv, 1. - vUv);
  col *= smoothstep(0., .16, e.x) * smoothstep(0., .2, e.y) * (1. - .25 * smoothstep(.3, .5, length(vUv - .5)));
  gl_FragColor = vec4(pow(col, vec3(1. / 2.2)), 1.);
}`;
const PK = { gl: null, prog: null, u: {}, imgs: null, ready: false, c2d: null };
function loadImages() {
  const keys = ['u', 'c', 'l', 'r', 'b'];
  return Promise.all(keys.map(k => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = IMG[k];
  }))).then(list => { PK.imgs = Object.fromEntries(keys.map((k, i) => [k, list[i]])); });
}
function initPumpkin() {
  try {
    const gl = pkc.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('no webgl');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    ['tU', 'tC', 'tL', 'tR', 'tB'].forEach((n, i) => { gl.uniform1i(gl.getUniformLocation(p, n), i); });
    for (const n of ['uA', 'uFlick', 'uSway', 'uMorph', 'uFlare']) PK.u[n] = gl.getUniformLocation(p, n);
    PK.gl = gl; PK.prog = p;
  } catch (e) {
    console.warn('pumpkin: falling back to 2D', e);
    PK.c2d = pkc.getContext('2d');
  }
  loadImages().then(() => {
    const gl = PK.gl;
    if (gl) {
      ['u', 'c', 'l', 'r', 'b'].forEach((k, i) => {
        const tx = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, PK.imgs[k]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      });
    }
    PK.ready = true;
  }).catch(e => console.warn('pumpkin images failed', e));
}
function drawPumpkin(a, flick, sway, morph, flare) {
  if (!PK.ready) return;
  if (PK.gl) {
    const gl = PK.gl;
    gl.viewport(0, 0, pkc.width, pkc.height);
    gl.uniform1f(PK.u.uA, a); gl.uniform1f(PK.u.uFlick, flick); gl.uniform1f(PK.u.uSway, sway);
    gl.uniform1f(PK.u.uMorph, morph); gl.uniform1f(PK.u.uFlare, flare);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } else if (PK.c2d) {
    const c = PK.c2d, w = pkc.width, h = pkc.height;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.drawImage(PK.imgs.u, 0, 0, w, h);
    c.globalAlpha = clamp(a * flick, 0, 1); c.drawImage(PK.imgs.c, 0, 0, w, h);
    c.globalAlpha = 1;
  }
}

/* ================= geometry ================= */
let W = 390, H = 844, pr = 1, devScale = 1;
const box = { x: 0, y: 0, s: 400 };          // pumpkin canvas square, screen px
const light = { x: 195, y: 300, R: 640 };
const FALL = [[0, 1], [.5, 1], [.8, .97], [1.1, .92], [1.5, .86]];
function falloff(x) {
  const L = FALL.length;
  if (x >= FALL[L - 1][0]) return FALL[L - 1][1];
  for (let i = 1; i < L; i++) if (x <= FALL[i][0]) { const [a, fa] = FALL[i - 1], [b, fb] = FALL[i]; return lerp(fa, fb, (x - a) / (b - a)); }
  return 1;
}
let lit = [];
function collectLit() { lit = [...screenEl.querySelectorAll('[data-lit]')].map(el => ({ el, cx: 0, cy: 0 })); }
function offsetIn(el) {
  let x = 0, y = 0;
  while (el && el !== screenEl) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
  return [x, y];
}
function measure() {
  W = screenEl.offsetWidth; H = screenEl.offsetHeight;
  pr = Math.min(3, (window.devicePixelRatio || 1) * devScale);
  fx.width = Math.round(W * pr); fx.height = Math.round(H * pr);
  const [sx, sy] = offsetIn(stage), sw = stage.offsetWidth, sh = stage.offsetHeight;
  box.s = Math.round(clamp(Math.min(W * 1.18, sh * 1.42), 260, 560));
  box.x = Math.round(sx + sw / 2 - box.s / 2);
  box.y = Math.round(sy + sh / 2 - box.s * .5 + box.s * .04);
  Object.assign(pkc.style, { left: box.x + 'px', top: box.y + 'px', width: box.s + 'px', height: box.s + 'px' });
  const px = Math.round(box.s * pr);
  if (pkc.width !== px) { pkc.width = pkc.height = px; }
  const hs = box.s * .62;
  Object.assign(pkHit.style, { left: (box.x + box.s / 2 - hs / 2) + 'px', top: (box.y + box.s * .47 - hs / 2) + 'px', width: hs + 'px', height: hs * .9 + 'px' });
  hint.style.top = Math.min(box.y + box.s * .8, sy + sh - 34) + 'px';
  for (const o of lit) {
    const [x, y] = offsetIn(o.el);
    o.cx = x + o.el.offsetWidth / 2; o.cy = y + o.el.offsetHeight / 2;
  }
}

/* ================= particles ================= */
function sprite(rgb, size, core = .5) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.35, `rgba(${rgb},${core})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}
const SMOKE_WARM = sprite('255,170,105', 128, .45), SMOKE_COOL = sprite('150,160,200', 128, .45);
const EMBER = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,248,220,1)'); gr.addColorStop(.18, 'rgba(255,190,80,.95)'); gr.addColorStop(.45, 'rgba(255,90,31,.35)'); gr.addColorStop(1, 'rgba(255,90,31,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return c;
})();
const smoke = [], embers = [];
const dust = (() => { const r = rng(42); return Array.from({ length: 80 }, () => ({ a: r() * Math.PI * 2, d: .3 + r() * .38, z: r(), s: .6 + r() * 1.1, ph: r() * 100, v: .006 + r() * .012 })); })();
const pAt = (fx_, fy_) => [box.x + box.s * fx_, box.y + box.s * fy_];
function addSmoke(x, y, o) {
  if (smoke.length > 120) return;
  smoke.push(Object.assign({ x, y, vx: (Math.random() - .5) * 10, vy: -16 - Math.random() * 12, age: 0, life: 3.6 + Math.random() * 1.8, r0: 8, r1: 54, a: .07, curl: 24, buoy: -5, cool: false, seed: Math.random() * 100 }, o));
}
function emberBurst([x, y], n, spread = 18) {
  for (let i = 0; i < n && embers.length < 70; i++) {
    embers.push({ x: x + (Math.random() - .5) * spread, y: y + (Math.random() - .5) * 6, vx: (Math.random() - .5) * 40, vy: -50 - Math.random() * 80, age: 0, life: 1.2 + Math.random() * 1.4, s: 5 + Math.random() * 6, seed: Math.random() * 100 });
  }
}
const lidPt = () => pAt(.5 + (Math.random() - .5) * .1, .3);
function lightAt(x, y) { return clamp(st.Lc * falloff(Math.hypot(x - light.x, y - light.y) / light.R), 0, 1); }

/* ================= state ================= */
const st = {
  mode: 'dark', t0: -10, from: 0, playing: false, L: 0, Lc: 0,
  pulse: 0, chord: 0, lvl: 0, gutter: 0, wispUntil: 0, dragging: false, dragP: 0
};
const now = () => performance.now() / 1000;
function envelope(t) {
  const a = t - st.t0;
  if (st.mode === 'lit') {
    if (a < .3) return .3 * bump(a, .05, .022) + .5 * bump(a, .16, .028) + .26 * bump(a, .25, .02);
    if (a < .52) return .2 + 1.18 * easeOut((a - .3) / .22);
    if (a < 1.9) { const k = (a - .52) / 1.38; return 1 + .38 * (1 - easeOut(k)) + .05 * Math.sin(k * 19) * (1 - k); }
    return 1;
  }
  if (a < .55) { const k = a / .55; return st.from * (1 - easeIn(k)) + .22 * st.from * bump(a, .17, .035); }
  return 0;
}

/* ================= interface wiring ================= */
const np = $('#np'), btnPlay = $('#play'), icPlay = $('#icPlay'), icPause = $('#icPause'), icFlame = $('#icFlame'), playLabel = $('#playLabel');
const btnLike = $('#like'), btnLoop = $('#loop');
const candle = $('#candle'), trackEl = $('#track'), wax = $('#wax'), trail = $('#trail'), cflame = $('#cflame'), dropsEl = $('#drops');
const tiles = [...document.querySelectorAll('#tiles span')], nextTitle = $('#nextTitle'), nextDur = $('#nextDur');
let shownTrack = -1, drops = [], lastSec = -1, hintToken = 0, toldBlowOut = false;

function setHint(text, show, pulse) { hint.textContent = text; hint.classList.toggle('show', show); hint.classList.toggle('pulse', !!pulse); }
function makeDrops(i) {
  dropsEl.textContent = ''; drops = [];
  const r = rng(500 + i * 17);
  let x = .05 + r() * .03;
  while (x < .97) {
    const d = document.createElement('i'), s = .7 + r() * .7;
    d.style.left = (x * 100).toFixed(2) + '%';
    d.style.width = (4.4 * s).toFixed(1) + 'px'; d.style.height = (2.6 * s).toFixed(1) + 'px';
    d.style.top = (15 + r() * 3).toFixed(1) + 'px';
    dropsEl.appendChild(d); drops.push({ x, el: d, on: false });
    x += .035 + r() * .05;
  }
}
function renderNext(cur) {
  const i = (cur + 1) % TRACKS.length;
  nextTitle.textContent = TRACKS[i].title;
  nextDur.textContent = fmt(Sound.duration(i));
  $('#next').setAttribute('aria-label', `Next track: ${TRACKS[i].title}`);
}
function setTrackUI(i, animate) {
  const tr = TRACKS[i];
  const apply = () => {
    $('#title').textContent = tr.title;
    $('#meta').textContent = `${tr.artist} · ${tr.key} · ${tr.bpm} bpm`;
    candle.setAttribute('aria-valuemax', Math.round(Sound.duration(i)));
    renderNext(i); makeDrops(i); lastSec = -1;
  };
  if (animate && !reduce) { np.classList.add('swap'); setTimeout(() => { apply(); np.classList.remove('swap'); }, 200); }
  else apply();
  shownTrack = i;
}
function updatePlay() {
  const on = st.mode === 'lit';
  const label = !on ? 'Light the candle' : st.playing ? 'Pause' : 'Play';
  playLabel.textContent = label;
  icFlame.toggleAttribute('hidden', on);
  icPlay.toggleAttribute('hidden', !on || st.playing);
  icPause.toggleAttribute('hidden', !on || !st.playing);
  screenEl.dataset.playing = String(st.playing);
}
function ignite() {
  if (st.mode === 'lit') return;
  st.mode = 'lit'; st.t0 = now();
  screenEl.dataset.state = 'lit';
  pkHit.setAttribute('aria-pressed', 'true'); pkHit.setAttribute('aria-label', 'Blow out the pumpkin');
  if (Sound.init()) {
    Sound.sfx('strike', 0); Sound.sfx('whoosh', .3);
    st.playing = Sound.play(null, null, .42);
  }
  try { navigator.vibrate && navigator.vibrate([10, 90, 24]); } catch (e) {}
  setTimeout(() => { if (st.mode === 'lit') emberBurst(lidPt(), 14, 50); }, 480);
  const tok = ++hintToken;
  setHint(hint.textContent, false);
  if (!toldBlowOut) {
    toldBlowOut = true;
    setTimeout(() => { if (tok === hintToken) setHint('Tap it again to blow it out', true); }, 2400);
    setTimeout(() => { if (tok === hintToken) setHint('Tap it again to blow it out', false); }, 5400);
  }
  updatePlay();
}
function douse() {
  if (st.mode !== 'lit') return;
  st.from = clamp(st.L, .6, 1.2); st.mode = 'dark'; st.t0 = now();
  screenEl.dataset.state = 'dark';
  pkHit.setAttribute('aria-pressed', 'false'); pkHit.setAttribute('aria-label', 'Light the pumpkin');
  Sound.sfx('puff', 0); Sound.pause(.18);
  st.playing = false; st.wispUntil = now() + 1.9;
  const tok = ++hintToken;
  setHint(hint.textContent, false);
  setTimeout(() => { if (tok === hintToken) setHint('Tap the pumpkin to light it', true, true); }, 1700);
  updatePlay();
}
const toggleLight = () => (st.mode === 'lit' ? douse() : ignite());
function togglePlay() {
  if (st.mode !== 'lit') { ignite(); return; }
  if (st.playing) { Sound.pause(); st.playing = false; }
  else st.playing = Sound.play();
  updatePlay();
}
function go(i) {
  if (st.mode !== 'lit') { Sound.setTrack(i); ignite(); return; }
  st.playing = Sound.play(i, 0); st.gutter = 1; updatePlay();
}
const stepTrack = d => go((Sound.position().track + d + TRACKS.length) % TRACKS.length);

pkHit.addEventListener('click', toggleLight);
btnPlay.addEventListener('click', togglePlay);
$('#prev').addEventListener('click', () => {
  const p = Sound.position();
  if (p.pos > 3 && st.mode === 'lit') { Sound.seek(0); st.gutter = .6; } else stepTrack(-1);
});
$('#next').addEventListener('click', () => stepTrack(1));
btnLike.addEventListener('click', () => {
  const on = btnLike.getAttribute('aria-pressed') !== 'true';
  btnLike.setAttribute('aria-pressed', String(on));
  btnLike.classList.remove('pop'); void btnLike.offsetWidth; btnLike.classList.add('pop');
  if (on) {
    const [x, y] = offsetIn(btnLike);
    emberBurst([x + btnLike.offsetWidth / 2, y], 9, 22);
  }
});
btnLoop.addEventListener('click', () => {
  const on = btnLoop.getAttribute('aria-pressed') !== 'true';
  btnLoop.setAttribute('aria-pressed', String(on)); Sound.setLoop(on);
});

/* candle scrubbing */
const pFromX = x => { const r = trackEl.getBoundingClientRect(); return clamp((x - r.left) / r.width, 0, 1); };
candle.addEventListener('pointerdown', e => {
  if (st.mode !== 'lit') return;
  st.dragging = true; st.dragP = pFromX(e.clientX); candle.setPointerCapture(e.pointerId);
});
candle.addEventListener('pointermove', e => { if (st.dragging) st.dragP = pFromX(e.clientX); });
const endDrag = () => {
  if (!st.dragging) return;
  st.dragging = false;
  Sound.seek(st.dragP * Sound.duration(Sound.position().track));
  st.gutter = Math.max(st.gutter, .5);
};
candle.addEventListener('pointerup', endDrag);
candle.addEventListener('pointercancel', endDrag);
candle.addEventListener('keydown', e => {
  const p = Sound.position(), d = Sound.duration(p.track);
  let to = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = p.pos + 5;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = p.pos - 5;
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = d - 1;
  if (to != null) { e.preventDefault(); e.stopPropagation(); Sound.seek(clamp(to, 0, d - .5)); }
});
/* ================= recording mode ================= */
const html = document.documentElement, body = document.body, device = $('#device');
const toastEl = $('#toast'), keysHint = $('#keysHint');
let zoom = 1, userScale = 1, toastTimer = 0, idleTimer = 0, replayTimer = 0;
try { const v = parseFloat(localStorage.getItem('hl-scale')); if (v >= .4 && v <= 1.6) userScale = v; } catch (e) {}

function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1300);
}
function setScale(v) {
  userScale = Math.round(clamp(v, .4, 1.6) * 20) / 20;
  try { localStorage.setItem('hl-scale', String(userScale)); } catch (e) {}
  layout();
  toast(`Масштаб ${Math.round(userScale * 100)}%`);
}
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFullscreen() {
  if (fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const req = html.requestFullscreen || html.webkitRequestFullscreen;
  const blocked = () => toast('Полный экран недоступен здесь. Откройте страницу в отдельной вкладке');
  if (!req) { blocked(); return; }
  try { const p = req.call(html, { navigationUI: 'hide' }); if (p && p.catch) p.catch(blocked); } catch (e) { blocked(); }
}
function wake() {
  html.classList.remove('idle');
  clearTimeout(idleTimer);
  if (html.classList.contains('fs')) idleTimer = setTimeout(() => html.classList.add('idle'), 1500);
}
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
  html.classList.toggle('fs', !!fsElement());
  wake(); layout();
}));
document.addEventListener('mousemove', wake);
document.addEventListener('pointerdown', wake);
/* mouse clicks should not leave focus on a button, so Space and Enter stay global */
document.addEventListener('click', e => {
  const a = document.activeElement;
  if (e.detail > 0 && a && a.tagName === 'BUTTON') a.blur();
});

function startAnimation() { if (st.mode !== 'lit') ignite(); else togglePlay(); }
function resetScene() {
  clearTimeout(replayTimer);
  Sound.pause(.02); Sound.setTrack(0); Sound.setLoop(false);
  Object.assign(st, { mode: 'dark', t0: -10, from: 0, playing: false, L: 0, Lc: 0, pulse: 0, chord: 0, lvl: 0, gutter: 0, wispUntil: 0, dragging: false });
  smoke.length = 0; embers.length = 0;
  screenEl.dataset.state = 'dark';
  pkHit.setAttribute('aria-pressed', 'false'); pkHit.setAttribute('aria-label', 'Light the pumpkin');
  btnLike.setAttribute('aria-pressed', 'false'); btnLoop.setAttribute('aria-pressed', 'false');
  toldBlowOut = false; hintToken++;
  setHint('Tap the pumpkin to light it', true, true);
  setTrackUI(0, false);
  updatePlay();
}
function replay() { resetScene(); replayTimer = setTimeout(ignite, 900); }

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const onButton = t && t.closest && t.closest('button');
  const onSlider = t && t.closest && t.closest('[role="slider"]');
  switch (e.code) {
    case 'KeyF': if (!e.repeat) { e.preventDefault(); toggleFullscreen(); } break;
    case 'Space': case 'Enter': case 'NumpadEnter':
      if (onButton) return;
      e.preventDefault(); if (!e.repeat) startAnimation(); break;
    case 'KeyR': if (!e.repeat) { e.preventDefault(); replay(); } break;
    case 'Minus': case 'NumpadSubtract': e.preventDefault(); setScale(userScale - .05); break;
    case 'Equal': case 'NumpadAdd': e.preventDefault(); setScale(userScale + .05); break;
    case 'Digit0': case 'Numpad0': e.preventDefault(); setScale(1); break;
    case 'KeyL': if (!e.repeat) toggleLight(); break;
    case 'KeyH': if (!e.repeat) keysHint.hidden = !keysHint.hidden; break;
    case 'ArrowRight': if (!onButton && !onSlider) stepTrack(1); break;
    case 'ArrowLeft': if (!onButton && !onSlider) stepTrack(-1); break;
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && st.playing) { Sound.pause(); st.playing = false; updatePlay(); }
});

/* ================= layout: fit the artboard to the screen height with CSS zoom ================= */
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const framed = vw >= 520 && vh >= 480;
  body.classList.toggle('framed', framed);
  if (framed) {
    const fit = Math.min((vh - Math.round(vh * .06)) / 868, (vw - 32) / 414);
    zoom = fit * userScale;
    device.style.zoom = zoom.toFixed(4);
    body.classList.remove('compact');
  } else {
    zoom = 1; device.style.zoom = '';
    body.classList.toggle('compact', vh < 720);
  }
  devScale = zoom;
  measure();
}
const clock = $('#clock');
function tickClock() { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, ''); }

/* ================= frame ================= */
let lastT = now();
function frame(ms) {
  const t = ms / 1000, dt = clamp(t - lastT, 0, .05); lastT = t;

  for (const e of Sound.drain()) {
    if (e.k === 'bass') st.pulse += .45 * e.v;
    else if (e.k === 'kick') st.pulse += .3 * e.v;
    else if (e.k === 'chord') st.chord = Math.min(1, st.chord + .5 * e.v);
    else if (e.k === 'mel' && Math.random() < .3) emberBurst(lidPt(), 1);
  }
  st.pulse = Math.min(1.4, st.pulse) * Math.exp(-dt * 6);
  st.chord *= Math.exp(-dt * 2.2); st.gutter *= Math.exp(-dt * 3.5);
  const lv = st.playing ? Sound.levels() : null;
  st.lvl = lv != null ? st.lvl + (lv - st.lvl) * (lv > st.lvl ? .35 : .06) : st.lvl * Math.exp(-dt * 3);
  if (st.mode === 'lit' && Math.random() < dt * 1.3) Sound.sfx('crack');

  /* the flame */
  const env = envelope(t);
  const fl = reduce ? .97 : .88 + .08 * fbm(t * 1.9) + .04 * nz(t * 11.3 + 4);
  const music = st.playing ? .14 * st.pulse + .06 * st.chord + .08 * st.lvl : 0;
  const flick = fl * (1 - .45 * st.gutter) + music;
  const L = env * flick;
  st.L = L; st.Lc = clamp(L, 0, 1);
  const sway = reduce ? 0 : clamp(.65 * nz(t * 1.6) + .5 * st.pulse * nz(t * 7.3 + 2), -1, 1);
  const morph = reduce ? .5 : .5 + .5 * Math.sin(t * .23);
  drawPumpkin(env, flick, sway, morph, Math.max(0, env - 1) * .7);

  /* light on the interface */
  light.x = box.x + box.s * (.5 + .006 * sway); light.y = box.y + box.s * .54;
  light.R = Math.max(H * .8, 580) * (.86 + .14 * Math.min(L, 1.2));
  const Lc = st.Lc;
  screenEl.style.setProperty('--lx', light.x.toFixed(1) + 'px');
  screenEl.style.setProperty('--ly', light.y.toFixed(1) + 'px');
  screenEl.style.setProperty('--L', L.toFixed(3));
  screenEl.style.setProperty('--warm', Lc.toFixed(3));
  dark.style.background = `radial-gradient(circle at ${light.x.toFixed(1)}px ${light.y.toFixed(1)}px, ` +
    FALL.map(([x, f]) => `rgba(5,5,5,${(1 - Lc * f).toFixed(3)}) ${(x * light.R).toFixed(0)}px`).join(',') + ')';
  for (const o of lit) {
    const dx = o.cx - light.x, dy = o.cy - light.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const f = falloff(d / light.R) * Lc, len = (2 + d * .016) * (.8 + .2 * fl);
    const s = o.el.style;
    s.setProperty('--rx', ux.toFixed(3)); s.setProperty('--ry', uy.toFixed(3));
    s.setProperty('--ra', (f * .6).toFixed(3));
    s.setProperty('--sx', (ux * len).toFixed(2)); s.setProperty('--sy', (uy * len).toFixed(2));
    s.setProperty('--sa', (f * .55).toFixed(3));
  }

  /* candle progress */
  const pos = Sound.position();
  if (pos.track !== shownTrack) { setTrackUI(pos.track, shownTrack !== -1); if (shownTrack !== -1) st.gutter = 1; }
  const dur = Sound.duration(pos.track);
  const p = st.dragging ? st.dragP : clamp(pos.pos / dur, 0, 1);
  const pct = (p * 100).toFixed(3) + '%';
  wax.style.left = pct; cflame.style.left = pct; trail.style.width = pct;
  for (const d of drops) { const on = d.x < p - .01; if (on !== d.on) { d.on = on; d.el.classList.toggle('on', on); } }
  const fsx = .9 + .1 * nz(t * 9 + 5), fsy = (.86 + .2 * nz(t * 7.3 + 2) + (st.dragging ? .4 : 0)) * (st.playing ? 1 : .75);
  cflame.style.transform = `scale(${fsx.toFixed(3)},${fsy.toFixed(3)}) skewX(${(6 * nz(t * 4)).toFixed(2)}deg)`;
  const sec = Math.floor(p * dur);
  if (sec !== lastSec) {
    lastSec = sec;
    const mm = String(Math.floor(sec / 60)).padStart(2, '0'), ss = String(sec % 60).padStart(2, '0');
    tiles[0].textContent = mm[0]; tiles[1].textContent = mm[1]; tiles[2].textContent = ss[0]; tiles[3].textContent = ss[1];
    candle.setAttribute('aria-valuenow', sec);
    candle.setAttribute('aria-valuetext', `${fmt(sec)} of ${fmt(dur)}`);
  }

  /* fx: dust in the light, smoke, embers */
  fctx.setTransform(pr, 0, 0, pr, 0, 0);
  fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1;
  fctx.clearRect(0, 0, W, H);
  drawDust(dt, t, Lc);
  drawSmoke(dt, t, Lc);
  drawEmbers(dt, t);

  requestAnimationFrame(frame);
}
function drawDust(dt, t, Lc) {
  const cx = box.x + box.s * .5, cy = box.y + box.s * .48;
  fctx.fillStyle = 'rgb(255,190,120)';
  for (const d of dust) {
    if (!reduce) { d.z = (d.z + d.v * dt) % 1; }
    const a = d.a + Math.sin(t * .1 + d.ph) * .05;
    const r = box.s * d.d * (1 + .04 * Math.sin(t * .3 + d.ph));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * .9 - d.z * 24;
    const tw = .5 + .5 * Math.sin(t * (1.3 + d.s) + d.ph);
    const alpha = (Lc * (.25 + .75 * tw) * (1 - d.z) + .05 * (1 - Lc) * tw) * .9;
    if (alpha < .01) continue;
    fctx.globalAlpha = alpha;
    fctx.beginPath(); fctx.arc(x, y, d.s * .75, 0, Math.PI * 2); fctx.fill();
  }
  fctx.globalAlpha = 1;
}
function drawSmoke(dt, t, Lc) {
  const k = reduce ? .3 : 1;
  if (st.mode === 'lit' && Lc > .05) {
    if (Math.random() < (2.5 + 8 * st.lvl) * Lc * k * dt) { const [x, y] = lidPt(); addSmoke(x, y); }
  }
  if (t < st.wispUntil && Math.random() < 34 * dt * k) {
    const [x, y] = pAt(.5 + Math.sin(t * 7) * .004, .31);
    addSmoke(x, y, { vx: 0, vy: -30, r0: 3, r1: 26, life: 3.2, a: .24, cool: true, curl: 34, buoy: -4 });
  }
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.age += dt;
    if (p.age > p.life) { smoke.splice(i, 1); continue; }
    const q = p.age / p.life;
    p.vx += nz(p.seed + t * .7) * p.curl * dt; p.vx *= 1 - .6 * dt;
    p.vy += p.buoy * dt; p.vy *= 1 - .2 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const r = lerp(p.r0, p.r1, easeOut(q)), a = p.a * Math.sin(Math.PI * Math.min(1, q * 1.1));
    if (p.cool) { fctx.globalAlpha = a; fctx.drawImage(SMOKE_COOL, p.x - r, p.y - r, r * 2, r * 2); }
    else {
      const l = lightAt(p.x, p.y);
      if (l > .01) { fctx.globalAlpha = a * l; fctx.drawImage(SMOKE_WARM, p.x - r, p.y - r, r * 2, r * 2); }
    }
  }
  fctx.globalAlpha = 1;
}
function drawEmbers(dt, t) {
  fctx.globalCompositeOperation = 'lighter';
  for (let i = embers.length - 1; i >= 0; i--) {
    const p = embers[i];
    p.age += dt;
    if (p.age > p.life) { embers.splice(i, 1); continue; }
    p.vx += nz(p.seed + t * 2) * 60 * dt; p.vx *= 1 - 1.2 * dt;
    p.vy += -18 * dt; p.vy *= 1 - .6 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const q = p.age / p.life;
    fctx.globalAlpha = (1 - q) * (.55 + .45 * nz(p.seed + t * 14));
    const s = p.s * (1 - q * .5);
    fctx.drawImage(EMBER, p.x - s, p.y - s, s * 2, s * 2);
  }
  fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'source-over';
}

/* ================= boot ================= */
collectLit();
setTrackUI(0, false);
tickClock(); setInterval(tickClock, 15000);
layout();
initPumpkin();
updatePlay();
if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(document.body);
else window.addEventListener('resize', layout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());
requestAnimationFrame(frame);
})();
</script>
