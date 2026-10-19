"use strict";

const SVG = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const caja = $("caja"), parche = $("parche"), aro = $("aro"), palillo = $("palillo"), cintas = $("cintas"), ondas = $("ondas");

const R_CUERO = 150, R_ARO = 186;

function el(tag, attrs, parent) {
  const e = document.createElementNS(SVG, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------- dibujo: tientos en zigzag y cintas ----------
(function dibujar() {
  const g = $("tientos");
  const n = 22, rIn = R_CUERO + 6, rOut = R_ARO - 6;
  let d = "";
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? rOut : rIn;
    d += `${i ? "L" : "M"}${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
    if (i % 2 && i < n * 2) el("circle", { cx: Math.cos(a) * (rOut + 1), cy: Math.sin(a) * (rOut + 1), r: 3.5 }, g);
  }
  el("path", { d }, g);

  const colores = ["#d2342a", "#f2b632", "#2f8f4e", "#2b6cb0", "#c2367a", "#f27a2a"];
  colores.forEach((c, i) => {
    const x = -58 + i * 23, top = Math.sqrt(R_ARO * R_ARO - x * x) - 10, len = 70 + ((i * 37) % 30), w = 13;
    const wave = (y) => Math.sin(y / 14 + i) * 5;
    let left = "", right = "";
    for (let y = 0; y <= len; y += 6) {
      left += `${y ? "L" : "M"}${(x - w / 2 + wave(y)).toFixed(1)},${(top + y).toFixed(1)}`;
      right = `L${(x + w / 2 + wave(y)).toFixed(1)},${(top + y).toFixed(1)}` + right;
    }
    // punta en V, como las cintas cortadas
    const tip = `L${(x + wave(len)).toFixed(1)},${(top + len - 9).toFixed(1)}`;
    el("path", { d: `${left}${tip}${right.replace(/^L/, "L")}Z`, fill: c }, cintas);
  });
})();

// ---------- sonido (sintetizado con Web Audio, sin muestras) ----------
let ac = null, master = null, noise = null;

function audio() {
  if (ac) { if (ac.state !== "running") ac.resume(); return ac; }
  // en iOS, sin esto el modo silencio calla el Web Audio
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  ac = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 4;
  master = ac.createGain(); master.gain.value = 0.9;
  master.connect(comp).connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

function env(gain, t, peak, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

function tone(type, f1, f2, glide, peak, decay, t) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + glide);
  env(g, t, peak, decay);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + decay + 0.05);
}

function hiss(freq, q, peak, decay, t, highpass = 0) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise;
  s.playbackRate.value = 0.9 + Math.random() * 0.2;
  f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  env(g, t, peak, decay);
  let node = s.connect(f);
  if (highpass) { const h = ac.createBiquadFilter(); h.type = "highpass"; h.frequency.value = highpass; node = node.connect(h); }
  node.connect(g).connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.05);
}

// golpe en el cuero: dist 0 = centro (grave, largo), 1 = borde (más agudo y seco)
function golpeCuero(dist, vel) {
  audio();
  const t = ac.currentTime + 0.005, f0 = 92 + dist * 70;
  tone("sine", f0 * 1.7, f0, 0.07, 0.95 * vel, 0.55 - dist * 0.25, t);          // el cuerpo
  tone("triangle", f0 * 2.4, f0 * 2.1, 0.05, (0.12 + dist * 0.2) * vel, 0.14, t); // armónico
  hiss(1600 + dist * 1600, 0.9, (0.18 + dist * 0.22) * vel, 0.2 + (1 - dist) * 0.1, t, 600); // chirlera
}

// golpe en el aro de madera: seco, casi sin cuero
function golpeAro(vel) {
  audio();
  const t = ac.currentTime + 0.005;
  tone("sine", 1900, 950, 0.03, 0.45 * vel, 0.07, t);
  hiss(3800, 3, 0.45 * vel, 0.06, t);
  tone("sine", 190, 150, 0.04, 0.18 * vel, 0.12, t);
}

// ---------- toques ----------
function svgPoint(e) {
  const p = caja.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(caja.getScreenCTM().inverse());
}

let golpes = 0;
caja.addEventListener("pointerdown", (e) => {
  const { x, y } = svgPoint(e);
  const r = Math.hypot(x, y);
  if (r > R_ARO + 8) return;
  e.preventDefault();
  const vel = e.pressure && e.pressure !== 0.5 ? 0.5 + e.pressure * 0.5 : 1;
  if (r <= R_CUERO) {
    golpeCuero(r / R_CUERO, vel);
    onda(x, y);
    parche.classList.remove("golpe"); void parche.getBBox(); parche.classList.add("golpe");
  } else {
    golpeAro(vel);
  }
  verPalillo(x, y);
  cintas.classList.remove("vuelo"); void cintas.getBBox(); cintas.classList.add("vuelo");
  if (navigator.vibrate) navigator.vibrate(r <= R_CUERO ? 12 : 6);
  if (++golpes === 3) $("hint").classList.add("gone");
});

function onda(x, y) {
  const c = el("circle", { cx: x, cy: y, r: 6, class: "onda" }, ondas);
  const t0 = performance.now();
  (function grow(now) {
    const k = Math.min(1, (now - t0) / 600);
    c.setAttribute("r", 6 + k * 120);
    if (k < 1) requestAnimationFrame(grow); else c.remove();
  })(t0);
}

function verPalillo(x, y) {
  palillo.setAttribute("transform", `translate(${x} ${y})`);
  palillo.style.transition = "none";
  palillo.setAttribute("opacity", "1");
  clearTimeout(verPalillo.t);
  verPalillo.t = setTimeout(() => { palillo.style.transition = ""; palillo.setAttribute("opacity", "0"); }, 160);
}

// ---------- sin zoom (iOS ignora user-scalable=no) ----------
["gesturestart", "gesturechange"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
document.addEventListener("dblclick", (e) => e.preventDefault());
