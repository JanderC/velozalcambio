import type { MouseEvent } from "react";

// En la computadora, cada enlace de WhatsApp abre una pestaña nueva de WhatsApp Web, y no hay forma de volver a usar
// la misma: WhatsApp Web se aísla de la pestaña que lo abrió. La salida es abrir la aplicación de WhatsApp de la
// computadora (whatsapp://), que siempre es la misma ventana. Se pregunta una vez por equipo y queda guardado.
const CLAVE = "veloza.whatsapp.modo";
type Modo = "app" | "navegador";

const esTelefono = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function modoGuardado(): Modo | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === "app" || v === "navegador" ? v : null;
  } catch {
    return null;
  }
}

function preguntarModo(): Modo {
  const modo: Modo = window.confirm(
    "¿Esta computadora tiene instalada la aplicación de WhatsApp?\n\n" +
      "Aceptar: los mensajes se abren en la aplicación, siempre en la misma ventana (no abre pestañas).\n" +
      "Cancelar: se abren en el navegador, una pestaña por mensaje.\n\n" +
      "Para cambiarlo después: clic en el botón de WhatsApp con la tecla Alt apretada."
  )
    ? "app"
    : "navegador";
  try {
    localStorage.setItem(CLAVE, modo);
  } catch {
    // sin almacenamiento: se vuelve a preguntar la próxima vez
  }
  return modo;
}

/** El enlace normal de WhatsApp (en el teléfono abre la aplicación). Sin teléfono, allá se elige el contacto. */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje: string) {
  return `https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Para el onClick de un enlace de WhatsApp: en la computadora, si se eligió la aplicación, abre el mensaje ahí
 * en vez de abrir otra pestaña. En el teléfono, o si se eligió el navegador, el enlace sigue como siempre.
 */
export function alAbrirWhatsApp(e: MouseEvent<HTMLAnchorElement>, telefono: string | null | undefined, mensaje: string) {
  if (esTelefono()) return;
  // Alt + clic: volver a elegir
  const modo = e.altKey ? preguntarModo() : (modoGuardado() ?? preguntarModo());
  if (modo !== "app") return;
  e.preventDefault();
  // Si la aplicación abre, esta ventana pierde el foco. Si en un momento no pasó nada, es que no está instalada:
  // se abre en el navegador como siempre y este equipo vuelve a quedar en "navegador", para que el botón nunca quede muerto.
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
    try {
      localStorage.setItem(CLAVE, "navegador");
    } catch {
      // sin almacenamiento: la próxima vez se vuelve a preguntar
    }
    window.open(enlaceWhatsApp(telefono, mensaje), "_blank", "noreferrer");
  }, 1500);
  window.location.href = `whatsapp://send?${telefono ? `phone=${telefono}&` : ""}text=${encodeURIComponent(mensaje)}`;
}
