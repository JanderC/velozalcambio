// En Confirmaciones el cliente se crea con nombre y apellido y con su número de teléfono: con "Daniel" solo
// se confundía con todos los Daniel. Las mismas reglas las revisa el servidor.

/** Al menos dos palabras de 2 letras o más: nombre y apellido. */
export function tieneNombreYApellido(nombre: string) {
  return nombre.trim().split(/\s+/).filter((p) => /\p{L}{2,}/u.test(p)).length >= 2;
}

/** Un teléfono con al menos 10 dígitos (3001234567, 04141234567, +58 414…). */
export function telefonoValido(telefono: string) {
  return telefono.replace(/\D/g, "").length >= 10;
}

/** Una casilla con al menos una palabra de 2 letras o más. */
const conLetras = (t: string) => /\p{L}{2,}/u.test(t);

/** Nombre y apellido en una sola línea, como se guarda el cliente. */
export const unirNombre = (nombre: string, apellido: string) => `${nombre.trim()} ${apellido.trim()}`.replace(/\s+/g, " ").trim();

/** Separa lo guardado en nombre (la primera palabra) y apellido (el resto), para las dos casillas. */
export function separarNombre(completo: string) {
  const [nombre = "", ...resto] = completo.trim().split(/\s+/);
  return { nombre, apellido: resto.join(" ") };
}

/** El primer error de los datos del cliente de Confirmaciones, o null si están bien. */
export function errorDatosCliente(nombre: string, apellido: string, telefono: string) {
  if (!conLetras(nombre)) return "Escribí el nombre del cliente.";
  if (!conLetras(apellido)) return "Escribí el apellido del cliente: con el nombre solo se confunde con otros (ej. Daniel → Daniel Pérez).";
  if (!telefono.trim()) return "Escribí el número de teléfono del cliente: es obligatorio.";
  if (!telefonoValido(telefono)) return "El número de teléfono está incompleto: tiene que tener al menos 10 dígitos (con el código de país si es de afuera).";
  return null;
}
