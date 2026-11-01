const Sound = (() => {
  let ctx = null, out, bus, dry, wet, an, fbuf, nbuf, crackBuf, crackSrc = null, ther = null;
  const ch = {}, ev = [];
  const S = { playing: false, track: 0, step: 0, next: 0, startAt: 0, paused: 0, timer: 0, prev: 0, switchAt: 0, loop: false };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const sd = tr => 60 / tr.bpm / 4;
  const spb = tr => tr.beats * 4;
  const total = tr => tr.bars * spb(tr);
  const duration = i => total(TRACKS[i]) * sd(TRACKS[i]);

  function noiseBuffer(sec) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  function crackleBuffer(sec) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * .01;
    for (let k = 0; k < sec * 9; k++) {
      const p = Math.floor(Math.random() * (len - 80)), a = (Math.random() * .7 + .2) * (Math.random() < .5 ? -1 : 1);
      for (let j = 0; j < 60; j++) d[p + j] += a * Math.pow(1 - j / 60, 3) * (j % 2 ? -1 : 1);
    }
    return b;
  }
  function channel(level, send, pan) {
    const g = ctx.createGain(); g.gain.value = level;
    let o = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); o = p; }
    o.connect(dry);
    if (send) { const s = ctx.createGain(); s.gain.value = send; o.connect(s); s.connect(wet); }
    return g;
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    out = ctx.createGain(); out.gain.value = .9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = .006; comp.release.value = .22;
    an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = .45;
    out.connect(comp); comp.connect(an); an.connect(ctx.destination);
    fbuf = new Uint8Array(an.frequencyBinCount);
    bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 6800; warm.Q.value = .5; warm.connect(bus);
    dry = ctx.createGain(); dry.connect(warm);
    const conv = ctx.createConvolver(); conv.buffer = impulse(2.8, 2.6);
    wet = ctx.createGain(); wet.connect(conv);
    const wetOut = ctx.createGain(); wetOut.gain.value = .36; conv.connect(wetOut); wetOut.connect(warm);
    nbuf = noiseBuffer(2); crackBuf = crackleBuffer(5);
    ch.kick = channel(.85, .02); ch.brush = channel(.5, .22, -.2); ch.ride = channel(.22, .2, .28);
    ch.bass = channel(.8, .05); ch.keys = channel(.34, .42); ch.lead = channel(.36, .55, .06); ch.vib = channel(.32, .5, -.08);
    ch.crack = channel(.07, 0);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.2; const lg = ctx.createGain(); lg.gain.value = .09; lfo.connect(lg); lg.connect(ch.keys.gain); lfo.start();
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 5.2; const lg2 = ctx.createGain(); lg2.gain.value = .1; lfo2.connect(lg2); lg2.connect(ch.vib.gain); lfo2.start();
    return true;
  }

  /* instruments */
  function nsrc(t, dur) { const s = ctx.createBufferSource(); s.buffer = nbuf; s.start(t, Math.random() * 1.4); s.stop(t + dur); return s; }
  function env(g, t, peak, a, d) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
  function kick(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(46, t + .11);
    env(g, t, v, .004, .36); o.connect(g); g.connect(ch.kick); o.start(t); o.stop(t + .42);
  }
  function brush(t, v) {
    const s = nsrc(t, .32), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = .7;
    env(g, t, v * .6, .014, .24); s.connect(f); f.connect(g); g.connect(ch.brush);
  }
  function ride(t, v) {
    const s = nsrc(t, .4), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 6800;
    env(g, t, v * .5, .002, .3); s.connect(f); f.connect(g); g.connect(ch.ride);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.value = 5150; env(og, t, v * .05, .002, .35); o.connect(og); og.connect(ch.ride); o.start(t); o.stop(t + .4);
  }
  function bass(t, m, dur, v) {
    const f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f; g2.gain.value = .6;
    lp.type = 'lowpass'; lp.Q.value = 1.1;
    lp.frequency.setValueAtTime(f * 7, t); lp.frequency.exponentialRampToValueAtTime(f * 2.4, t + .16);
    const dEnd = Math.min(.2, dur * .9);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012);
    g.gain.exponentialRampToValueAtTime(v * lerp(1, .42, dEnd / .2), t + dEnd);
    g.gain.setTargetAtTime(.0001, t + dur, .05);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(ch.bass);
    o.start(t); o2.start(t); o.stop(t + dur + .5); o2.stop(t + dur + .5);
  }
  function epiano(t, m, dur, v) {
    const f = mtof(m), c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = f; mo.frequency.value = f;
    mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * .12, t + .7);
    mo.connect(mg); mg.connect(c.frequency);
    const dEnd = Math.min(1.1, dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .01);
    g.gain.exponentialRampToValueAtTime(v * lerp(1, .32, dEnd / 1.1), t + dEnd);
    g.gain.setTargetAtTime(.0001, t + dur, .18);
    c.connect(g); g.connect(ch.keys);
    c.start(t); mo.start(t); c.stop(t + dur + 1.4); mo.stop(t + dur + 1.4);
  }
  function vib(t, m, dur, v) {
    const f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.frequency.value = f; o2.frequency.value = f * 4;
    g2.gain.setValueAtTime(.0001, t); g2.gain.exponentialRampToValueAtTime(v * .3, t + .004); g2.gain.exponentialRampToValueAtTime(.0001, t + .25);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .006); g.gain.setTargetAtTime(.0001, t + .006, Math.max(.35, dur * .6));
    o.connect(g); o2.connect(g2); g.connect(ch.vib); g2.connect(ch.vib);
    o.start(t); o2.start(t); o.stop(t + dur + 2.2); o2.stop(t + dur + 2.2);
  }
  function therVoice() {
    if (ther) return ther;
    const o = ctx.createOscillator();
    o.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 1, .22, .09, .04, .02]), new Float32Array(6)));
    const lfo = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
    lfo.frequency.value = 5.4; depth.gain.value = 0; g.gain.value = 0;
    lfo.connect(depth); depth.connect(o.frequency); o.connect(g); g.connect(ch.lead);
    o.start(); lfo.start();
    return (ther = { o, lfo, depth, g });
  }
  function therNote(t, m, dur, v) {
    const th = therVoice(), f = mtof(m);
    th.o.frequency.setTargetAtTime(f, t, .045);
    th.depth.gain.setTargetAtTime(0, t, .01); th.depth.gain.setTargetAtTime(f * .014, t + .18, .25);
    th.g.gain.setTargetAtTime(v * .5, t, .05);
    th.g.gain.setTargetAtTime(0, t + dur - .04, .07);
  }
  function therKill(at) {
    if (!ther) return;
    const t0 = Math.max(at || 0, ctx.currentTime), th = ther; ther = null;
    th.g.gain.cancelScheduledValues(t0); th.g.gain.setTargetAtTime(0, t0, .05);
    th.o.stop(t0 + .5); th.lfo.stop(t0 + .5);
  }
  function startCrackle() {
    if (crackSrc) return;
    crackSrc = ctx.createBufferSource(); crackSrc.buffer = crackBuf; crackSrc.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1000;
    crackSrc.connect(hp); hp.connect(ch.crack); crackSrc.start();
  }
  function stopCrackle(at) { if (!crackSrc) return; crackSrc.stop(at); crackSrc = null; }

  /* sequencer */
  const push = (t, k, v) => ev.push({ t, k, v });
  function scheduleStep(tr, s, t) {
    const n = spb(tr), bar = Math.floor(s / n), st = s % n, d = sd(tr), L = tr.chords.length;
    const rel = bar - tr.intro, ci = ((rel % L) + L) % L;
    const intro = rel < 0, end = bar === tr.bars - 1, phrase = Math.floor(rel / 8);
    const tt = t + (tr.swing && st % 4 === 2 ? tr.swing * d * .667 : 0);
    const hum = () => (Math.random() - .5) * .008, vel = v => v * (.88 + Math.random() * .24);

    if (!intro && !end) {
      if (tr.drums.kick[st] === 'x') { kick(tt + hum(), vel(.7)); push(tt, 'kick', .7); }
      if (tr.drums.brush[st] === 'x') brush(tt + hum(), vel(.6));
      if (tr.drums.ride[st] === 'x') ride(tt + hum(), vel(st % 4 === 0 ? .55 : .38));
    } else if (intro && st % 4 === 0 && tr.drums.ride[st] === 'x') ride(tt, .25);
    if (end && st === 0) { kick(tt, .5); ride(tt, .4); push(tt, 'kick', .5); }

    for (const [bs, m, len] of tr.bass[ci]) if (bs === st) {
      bass(tt + hum(), m, (end ? n : len) * d * .92, vel(.8)); push(tt, 'bass', .8);
    }
    const comp = end ? [[0, n, .8]] : (rel >= 0 && phrase % 2 === 1 ? tr.comp2 : tr.comp);
    for (const [cs, len, v] of comp) if (cs === st) {
      for (const m of tr.chords[ci]) epiano(tt + hum() * .5, m, len * d, vel(v) * .55);
      push(tt, 'chord', v);
    }
    if (!intro && !end && phrase % 2 === 0) {
      const mb = rel % 8;
      for (const [b, ms, m, len] of tr.melody) if (b === mb && ms === st) {
        if (tr.lead === 'ther') therNote(tt, m, len * d, .8); else vib(tt, m, len * d, .8);
        push(tt, 'mel', .8);
      }
    }
  }
  function tick() {
    if (!S.playing) return;
    const horizon = ctx.currentTime + .15;
    while (S.next < horizon) {
      let tr = TRACKS[S.track];
      if (S.step >= total(tr)) {
        const nt = S.loop ? S.track : (S.track + 1) % TRACKS.length;
        S.prev = S.track; S.track = nt; S.step = 0; S.startAt = S.next; S.switchAt = S.next;
        therKill(S.next);
        tr = TRACKS[nt];
      }
      scheduleStep(tr, S.step, S.next);
      S.step++; S.next += sd(tr);
    }
  }
  function position() {
    if (!ctx || !S.playing) return { track: S.track, pos: S.paused };
    const now = ctx.currentTime;
    if (S.switchAt && now < S.switchAt) return { track: S.prev, pos: duration(S.prev) - (S.switchAt - now) };
    return { track: S.track, pos: clamp(now - S.startAt, 0, duration(S.track)) };
  }
  function play(i, pos, delay = .05) {
    if (!init()) return false;
    const cur = position();
    if (i == null) i = cur.track;
    if (pos == null) pos = i === cur.track ? cur.pos : 0;
    therKill();
    S.track = i;
    const d = sd(TRACKS[i]);
    pos = clamp(pos, 0, duration(i) - .05);
    S.step = Math.floor(pos / d); S.next = ctx.currentTime + delay; S.startAt = S.next - S.step * d; S.switchAt = 0;
    S.playing = true;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.setTargetAtTime(1, now + delay * .5, delay > .2 ? .45 : .06);
    startCrackle();
    clearInterval(S.timer); S.timer = setInterval(tick, 25); tick();
    return true;
  }
  function pause(fade = .06) {
    if (S.playing) { const p = position(); S.track = p.track; S.paused = p.pos; }
    S.playing = false; clearInterval(S.timer); ev.length = 0;
    if (!ctx) return;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.setTargetAtTime(0, now, fade);
    therKill(); stopCrackle(now + fade * 6);
  }
  function seek(pos) { if (S.playing) play(position().track, pos); else S.paused = pos; }
  function setTrack(i) { S.track = i; S.paused = 0; }

  /* sound effects for the candle itself */
  function sfx(kind, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    if (kind === 'strike') {
      for (const [dt, a] of [[0, .3], [.11, .45], [.21, .28]]) {
        const s = nsrc(t + dt, .1), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = 2600 + Math.random() * 1800; f.Q.value = .9;
        env(g, t + dt, a, .006, .07); s.connect(f); f.connect(g); g.connect(out);
      }
    } else if (kind === 'whoosh') {
      const s = nsrc(t, 1.3), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(2600, t + .22); f.frequency.exponentialRampToValueAtTime(500, t + 1.1);
      env(g, t, .42, .09, 1.1); s.connect(f); f.connect(g); g.connect(out);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.setValueAtTime(82, t); o.frequency.exponentialRampToValueAtTime(44, t + .3);
      env(og, t, .35, .01, .35); o.connect(og); og.connect(out); o.start(t); o.stop(t + .4);
    } else if (kind === 'puff') {
      const s = nsrc(t, .5), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 850;
      env(g, t, .5, .025, .42); s.connect(f); f.connect(g); g.connect(out);
    } else if (kind === 'crack') {
      const s = nsrc(t, .03), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 2400; f.Q.value = 2;
      env(g, t, .03 + Math.random() * .08, .002, .02); s.connect(f); f.connect(g); g.connect(out);
    }
  }
  function drain() {
    if (!ctx) return [];
    const now = ctx.currentTime, o = [];
    while (ev.length && ev[0].t <= now) o.push(ev.shift());
    return o;
  }
  function levels() {
    if (!ctx) return null;
    an.getByteFrequencyData(fbuf);
    const hz = ctx.sampleRate / an.fftSize;
    let s = 0, n = 0;
    for (let i = Math.max(1, Math.floor(40 / hz)); i <= Math.ceil(9000 / hz) && i < fbuf.length; i++) { s += fbuf[i]; n++; }
    return n ? s / n / 255 : 0;
  }
  return {
    init, play, pause, seek, setTrack, position, duration, drain, levels, sfx,
    setLoop: v => { S.loop = v; },
    get playing() { return S.playing; }
  };
})();
