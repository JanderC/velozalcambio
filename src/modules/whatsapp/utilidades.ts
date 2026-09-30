// Formatos de fecha/hora del panel de WhatsApp y un sonido corto para mensajes nuevos.

export function horaCorta(fecha: string) {
  return new Date(fecha).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
}

/** "14:05" hoy, "Ayer", "lun", o "12/09/2026" como en la lista de WhatsApp. */
export function fechaLista(fecha: string | null) {
  if (!fecha) return "";
  const d = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return horaCorta(fecha);
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  if (hoy.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString("es-CO", { weekday: "short" });
  return d.toLocaleDateString("es-CO");
}

/** Separador por día dentro del chat. */
export function etiquetaDia(fecha: string) {
  const d = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

export function haceMinutos(fecha: string | null) {
  if (!fecha) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

let audio: AudioContext | null = null;
/** Dos tonos cortos (sin archivo de audio). El navegador lo permite después de una interacción. */
export function sonarAviso() {
  try {
    audio ??= new AudioContext();
    const ahora = audio.currentTime;
    [880, 1320].forEach((frecuencia, i) => {
      const osc = audio!.createOscillator();
      const vol = audio!.createGain();
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, ahora + i * 0.12);
      vol.gain.exponentialRampToValueAtTime(0.12, ahora + i * 0.12 + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, ahora + i * 0.12 + 0.11);
      osc.connect(vol).connect(audio!.destination);
      osc.start(ahora + i * 0.12);
      osc.stop(ahora + i * 0.12 + 0.12);
    });
  } catch {
    // sin audio disponible
  }
}

/** Texto de WhatsApp a partes con *negrita*, _cursiva_ y ~tachado~ (sin HTML crudo). */
export function partesFormato(texto: string): { t: string; estilo?: "b" | "i" | "s" }[] {
  const partes: { t: string; estilo?: "b" | "i" | "s" }[] = [];
  const re = /\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index! > ultimo) partes.push({ t: texto.slice(ultimo, m.index) });
    if (m[1]) partes.push({ t: m[1], estilo: "b" });
    else if (m[2]) partes.push({ t: m[2], estilo: "i" });
    else if (m[3]) partes.push({ t: m[3], estilo: "s" });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ t: texto.slice(ultimo) });
  return partes;
}

export const EMOJIS = [
  "😀", "😊", "😂", "🙂", "😉", "😍", "🤝", "🙏", "👍", "👌", "👏", "🙌",
  "💪", "✅", "❌", "⏳", "⌛", "📌", "📷", "📄", "💵", "💶", "💰", "💸",
  "🏦", "📲", "📞", "✉️", "🕐", "📍", "🇨🇴", "🇻🇪", "🇺🇸", "⚠️", "❗", "❓",
  "😅", "🤔", "😔", "🥳", "🎉", "❤️",
];
