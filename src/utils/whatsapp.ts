import type { MouseEvent } from "react";

const esTelefono = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Teléfono como lo pide WhatsApp: solo dígitos y con código de país (celular colombiano o venezolano sin él -> se le agrega). */
export function telefonoWhatsApp(telefono: string | null | undefined) {
  const d = (telefono ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (d.length < 8) return null;
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  if (d.length === 11 && d.startsWith("04")) return `58${d.slice(1)}`;
  return d;
}

/** El enlace de WhatsApp con el mensaje ya escrito (wa.me). Sin teléfono, allá se elige el contacto. */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje: string) {
  return `https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(mensaje)}`;
}

// Cada computadora recuerda con qué abre WhatsApp: la aplicación instalada (por defecto) o WhatsApp Web
const CLAVE_MODO = "wa-abrir-con";
function modoDeEstaPc(): "app" | "web" {
  try {
    return localStorage.getItem(CLAVE_MODO) === "web" ? "web" : "app";
  } catch {
    return "app";
  }
}
function guardarModo(modo: "app" | "web") {
  try {
    if (modo === "web") localStorage.setItem(CLAVE_MODO, "web");
    else localStorage.removeItem(CLAVE_MODO);
  } catch {
    // no es grave: solo no se recuerda
  }
}

const abrirWeb = (destino: string) => window.open(`https://web.whatsapp.com/send?${destino}`, "_blank", "noreferrer");

/** Un aviso chico abajo de la pantalla, con botones. Se quita solo. No depende de React: se usa desde cualquier módulo. */
function aviso(texto: string, botones: { etiqueta: string; alTocar: () => void }[], segundos = 14) {
  document.getElementById("wa-aviso-abrir")?.remove();
  const caja = document.createElement("div");
  caja.id = "wa-aviso-abrir";
  caja.setAttribute("role", "alert");
  caja.style.cssText =
    "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2000;display:flex;flex-wrap:wrap;align-items:center;gap:10px;max-width:min(680px,calc(100vw - 24px));padding:12px 16px;border-radius:12px;background:#111b21;color:white;font:500 14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35)";
  const t = document.createElement("span");
  t.textContent = texto;
  t.style.cssText = "flex:1;min-width:200px";
  caja.append(t);
  const cerrar = () => caja.remove();
  for (const b of botones) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.textContent = b.etiqueta;
    boton.style.cssText = "border:none;border-radius:8px;padding:8px 12px;background:#25d366;color:#0b141a;font:600 13px Inter,system-ui,sans-serif;cursor:pointer";
    boton.onclick = () => {
      cerrar();
      b.alTocar();
    };
    caja.append(boton);
  }
  const equis = document.createElement("button");
  equis.type = "button";
  equis.textContent = "✕";
  equis.setAttribute("aria-label", "Cerrar");
  equis.style.cssText = "border:none;background:none;color:#aebac1;font-size:15px;cursor:pointer;padding:4px";
  equis.onclick = cerrar;
  caja.append(equis);
  document.body.append(caja);
  setTimeout(cerrar, segundos * 1000);
}

/** Abre la aplicación instalada. Si la computadora no la tiene, el navegador no avisa: se ofrece WhatsApp Web. */
function abrirAplicacion(destino: string) {
  // Si la aplicación (o la pregunta del navegador para abrirla) aparece, esta página pierde el foco
  let seFue = false;
  const alIrse = () => {
    seFue = true;
  };
  window.addEventListener("blur", alIrse);
  document.addEventListener("visibilitychange", alIrse);
  window.location.href = `whatsapp://send?${destino}`;
  setTimeout(() => {
    window.removeEventListener("blur", alIrse);
    document.removeEventListener("visibilitychange", alIrse);
    if (seFue) return;
    // No pasó nada: esta computadora no tiene la aplicación. No se abre nada solo: se ofrece, y elige la persona.
    aviso("¿No abrió WhatsApp? Esta computadora no tiene la aplicación instalada.", [
      { etiqueta: "Abrir en WhatsApp Web", alTocar: () => abrirWeb(destino) },
      {
        etiqueta: "Usar siempre WhatsApp Web en esta PC",
        alTocar: () => {
          guardarModo("web");
          abrirWeb(destino);
        },
      },
    ]);
  }, 1800);
}

/**
 * Para el onClick de un enlace de WhatsApp.
 *   Clic normal en la computadora: abre la aplicación de WhatsApp instalada (whatsapp://), sin abrir pestañas.
 *     El enlace wa.me no sirve para eso: según el navegador termina en WhatsApp Web.
 *     Si la computadora no tiene la aplicación, se ofrece WhatsApp Web y se puede dejar como lo de siempre en esa PC.
 *   Alt + clic: lo contrario de lo habitual en esa PC (WhatsApp Web, o la aplicación si la PC quedó en Web).
 *   En el teléfono no se toca: el enlace wa.me abre la aplicación.
 */
export function alAbrirWhatsApp(e: MouseEvent<HTMLAnchorElement>, telefono: string | null | undefined, mensaje: string) {
  if (esTelefono()) return;
  e.preventDefault();
  const destino = `${telefono ? `phone=${telefono}&` : ""}text=${encodeURIComponent(mensaje)}`;
  const enWeb = modoDeEstaPc() === "web";
  if (enWeb !== e.altKey) {
    abrirWeb(destino);
    return;
  }
  abrirAplicacion(destino);
  // la PC quedó en WhatsApp Web y se pidió la aplicación con Alt: se ofrece volver a dejarla como lo habitual
  if (enWeb) aviso("Esta PC abre WhatsApp Web. ¿Volver a abrir siempre la aplicación?", [{ etiqueta: "Sí, usar la aplicación", alTocar: () => guardarModo("app") }], 8);
}
