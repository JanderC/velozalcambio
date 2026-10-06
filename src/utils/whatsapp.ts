import type { MouseEvent } from "react";

// En la computadora los mensajes se abren en WhatsApp Web (web.whatsapp.com), directo: no hace falta tener instalada
// la aplicación. Cada mensaje abre una pestaña, porque WhatsApp Web se aísla de la pestaña que lo abrió y no se
// puede volver a usar la misma. El equipo que sí tenga la aplicación de WhatsApp puede elegir abrirlos ahí
// (siempre la misma ventana) con Alt + clic en el botón; queda guardado en ese equipo.
const CLAVE = "veloza.whatsapp.destino"; // clave nueva: la elección anterior se descarta y todos vuelven a WhatsApp Web
type Modo = "app" | "web";

const esTelefono = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function modoGuardado(): Modo {
  try {
    return localStorage.getItem(CLAVE) === "app" ? "app" : "web";
  } catch {
    return "web";
  }
}

function guardarModo(modo: Modo) {
  try {
    localStorage.setItem(CLAVE, modo);
  } catch {
    // sin almacenamiento: queda en WhatsApp Web
  }
}

function elegirModo(): Modo {
  const modo: Modo = window.confirm(
    "¿Abrir los mensajes en la aplicación de WhatsApp instalada en esta computadora?\n\n" +
      "Aceptar: en la aplicación, siempre en la misma ventana (tiene que estar instalada).\n" +
      "Cancelar: en WhatsApp Web, en el navegador."
  )
    ? "app"
    : "web";
  guardarModo(modo);
  return modo;
}

/**
 * El enlace de WhatsApp con el mensaje ya escrito. En el teléfono abre la aplicación; en la computadora, WhatsApp Web.
 * Sin teléfono, allá se elige el contacto.
 */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje: string) {
  const texto = encodeURIComponent(mensaje);
  if (esTelefono()) return `https://wa.me/${telefono ?? ""}?text=${texto}`;
  return `https://web.whatsapp.com/send?${telefono ? `phone=${telefono}&` : ""}text=${texto}`;
}

/**
 * Para el onClick de un enlace de WhatsApp. Normalmente no hace nada: el enlace abre WhatsApp Web (o la app en el teléfono).
 * Solo si en este equipo se eligió la aplicación (Alt + clic) abre el mensaje ahí; y si la aplicación no responde,
 * abre WhatsApp Web y el equipo vuelve a quedar en WhatsApp Web.
 */
export function alAbrirWhatsApp(e: MouseEvent<HTMLAnchorElement>, telefono: string | null | undefined, mensaje: string) {
  if (esTelefono()) return;
  const modo = e.altKey ? elegirModo() : modoGuardado();
  if (modo !== "app") return;
  e.preventDefault();
  let abrio = false;
  const alPerderFoco = () => {
    abrio = true;
  };
  window.addEventListener("blur", alPerderFoco, { once: true });
  document.addEventListener("visibilitychange", alPerderFoco, { once: true });
  window.setTimeout(() => {
    window.removeEventListener("blur", alPerderFoco);
    document.removeEventListener("visibilitychange", alPerderFoco);
    if (abrio || !document.hasFocus()) return;
    guardarModo("web");
    window.open(enlaceWhatsApp(telefono, mensaje), "_blank", "noreferrer");
  }, 1500);
  // en un marco oculto: si la aplicación no existe, esta pantalla no se ve afectada
  const marco = document.createElement("iframe");
  marco.style.display = "none";
  marco.src = `whatsapp://send?${telefono ? `phone=${telefono}&` : ""}text=${encodeURIComponent(mensaje)}`;
  document.body.appendChild(marco);
  window.setTimeout(() => marco.remove(), 3000);
}
