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
