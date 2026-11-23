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

/** El primer error de los datos del cliente de Confirmaciones, o null si están bien. */
export function errorDatosCliente(nombre: string, telefono: string) {
  if (!tieneNombreYApellido(nombre)) return "Escribí el nombre y el apellido del cliente (ej. Daniel Pérez), no solo el nombre.";
  if (!telefono.trim()) return "Escribí el número de teléfono del cliente: es obligatorio.";
  if (!telefonoValido(telefono)) return "El número de teléfono está incompleto: tiene que tener al menos 10 dígitos (con el código de país si es de afuera).";
  return null;
}
