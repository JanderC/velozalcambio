import type { MouseEvent } from "react";

const esTelefono = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** El enlace de WhatsApp con el mensaje ya escrito (wa.me). Sin teléfono, allá se elige el contacto. */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje: string) {
  return `https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Para el onClick de un enlace de WhatsApp.
 *   Clic normal en la computadora: abre la aplicación de WhatsApp instalada (whatsapp://), sin abrir pestañas.
 *     El enlace wa.me no sirve para eso: según el navegador termina en WhatsApp Web.
 *   Alt + clic: abre WhatsApp Web (web.whatsapp.com), para la computadora que no tiene la aplicación.
 *   En el teléfono no se toca: el enlace wa.me abre la aplicación.
 */
export function alAbrirWhatsApp(e: MouseEvent<HTMLAnchorElement>, telefono: string | null | undefined, mensaje: string) {
  if (esTelefono()) return;
  e.preventDefault();
  const destino = `${telefono ? `phone=${telefono}&` : ""}text=${encodeURIComponent(mensaje)}`;
  if (e.altKey) window.open(`https://web.whatsapp.com/send?${destino}`, "_blank", "noreferrer");
  else window.location.href = `whatsapp://send?${destino}`;
}
