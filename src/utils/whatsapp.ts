import type { MouseEvent } from "react";

/** El enlace normal de WhatsApp con el mensaje ya escrito (wa.me). Sin teléfono, allá se elige el contacto. */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje: string) {
  return `https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Para el onClick de un enlace de WhatsApp. El clic normal no cambia nada: abre el enlace de siempre.
 * Con Alt + clic se abre directo en WhatsApp Web (web.whatsapp.com), para la computadora que no tiene
 * la aplicación instalada o donde el enlace normal no abre.
 */
export function alAbrirWhatsApp(e: MouseEvent<HTMLAnchorElement>, telefono: string | null | undefined, mensaje: string) {
  if (!e.altKey) return;
  e.preventDefault();
  window.open(`https://web.whatsapp.com/send?${telefono ? `phone=${telefono}&` : ""}text=${encodeURIComponent(mensaje)}`, "_blank", "noreferrer");
}
