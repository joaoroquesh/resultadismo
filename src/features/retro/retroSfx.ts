// Som + vibração do Retrô (rodada 22) — WebAudio com osciladores curtos, ZERO assets
// (não pesa o bundle). Tudo best-effort: nunca quebra a UI, respeita um mute local e o
// prefers-reduced-motion (sem vibração). O AudioContext nasce no 1º gesto (o jogador já
// clicou "Jogar"), então não esbarra na política de autoplay.

let ctx: AudioContext | null = null;
const MUTE_KEY = "retro-muted";

function muted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isRetroMuted(): boolean {
  return muted();
}

export function setRetroMuted(v: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* ignora */
  }
}

function ac(): AudioContext | null {
  if (muted()) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Um "bip" com envelope curto (ataque rápido, decay suave) — base de tudo.
function blip(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.06, delay = 0): void {
  const c = ac();
  if (!c) return;
  try {
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* ignora */
  }
}

function buzz(ms: number | number[]): void {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.(ms);
  } catch {
    /* ignora */
  }
}

// Tique do cronômetro nos segundos finais (agudo, curtíssimo).
export function sfxTick(): void {
  blip(880, 0.05, "square", 0.03);
}

// Acertos: quanto melhor, mais "alto" e alegre.
export function sfxScore(type: "cravada" | "saldo" | "acerto" | "erro"): void {
  if (type === "cravada") {
    blip(660, 0.09, "triangle", 0.07);
    blip(990, 0.12, "triangle", 0.07, 0.07);
    blip(1320, 0.16, "triangle", 0.07, 0.15);
    buzz([0, 35, 40, 60]);
  } else if (type === "saldo") {
    blip(620, 0.1, "triangle", 0.06);
    blip(820, 0.12, "triangle", 0.06, 0.08);
    buzz(40);
  } else if (type === "acerto") {
    blip(560, 0.12, "sine", 0.05);
    buzz(25);
  } else {
    // erro: descida grave
    blip(200, 0.18, "sawtooth", 0.05);
    blip(150, 0.22, "sawtooth", 0.05, 0.06);
    buzz([0, 60, 30, 60]);
  }
}

// Ganhou uma ficha de troca 🎲.
export function sfxToken(): void {
  blip(1040, 0.07, "square", 0.05);
  blip(1560, 0.1, "square", 0.05, 0.06);
}

// Fanfarra de CAMPEÃO — arpejo maior ascendente.
export function sfxChampion(): void {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((f, i) => blip(f, 0.22, "triangle", 0.07, i * 0.1));
  buzz([0, 60, 40, 60, 40, 120]);
}

// ZEROU O GAME 👾 — fanfarra maior + brilho no topo.
export function sfxZerou(): void {
  const notes = [659, 784, 988, 1319, 1568, 2093];
  notes.forEach((f, i) => blip(f, 0.26, "triangle", 0.08, i * 0.11));
  buzz([0, 80, 40, 80, 40, 80, 40, 160]);
}
