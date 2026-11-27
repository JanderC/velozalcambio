import { formatearMonto } from "../../utils/montos";

// El mensaje que se le envía al cliente cuando la taquilla confirma o entrega: corto, claro y siempre igual.
//   Hola Nestor 👋
//   Su transacción fue entregada ✅
//
//   Monto: 310.000 COP
//   Entregado en efectivo
//
//   Recibe:
//   Iduar Veloza
//   C.I. 12345678
//   Telf. 3001234567
//
//   ¡Gracias por confiar en Veloz al Cambio!
export interface QuienRecibe {
  nombre: string | null;
  cedula?: string | null;
  telefono?: string | null;
}

export function mensajeParaCliente(d: { nombre: string | null; que: "entregada" | "confirmada" | "lista"; detalle: string[]; referencia?: string | null; recibe?: QuienRecibe | null }) {
  const saludo = d.nombre?.trim() ? `Hola ${nombrePropio(d.nombre.trim().split(/\s+/)[0] ?? "")} 👋` : "Hola 👋";
  const estado =
    d.que === "entregada" ? "Su transacción fue entregada ✅" : d.que === "confirmada" ? "Su transacción fue confirmada ✅" : "Su transferencia fue confirmada ✅ Ya puede pasar a retirar.";
  const detalle = d.detalle.filter(Boolean);
  const recibe = d.recibe?.nombre?.trim()
    ? [
        d.que === "lista" ? "Retira:" : "Recibe:",
        nombrePropio(d.recibe.nombre),
        ...(d.recibe.cedula?.trim() ? [`C.I. ${d.recibe.cedula.trim()}`] : []),
        ...(d.recibe.telefono?.trim() ? [`Telf. ${d.recibe.telefono.trim()}`] : []),
      ]
    : [];
  return [saludo, estado, ...(detalle.length ? ["", ...detalle] : []), ...(recibe.length ? ["", ...recibe] : []), "", "¡Gracias por confiar en Veloz al Cambio!"].join("\n");
}

/** El monto como se escribe en el mensaje: pesos «310.000 COP», divisa «$100», bolívares «1.500 VES». */
export function montoParaMensaje(monto: string, codigo: string) {
  const numero = formatearMonto(monto.replace(/^-/, ""));
  if (codigo === "USD" || codigo === "USDT") return `$${numero}`;
  if (codigo === "EUR") return `€${numero}`;
  return `${numero} ${codigo}`;
}

/** «iduar veloza» → «Iduar Veloza» */
function nombrePropio(nombre: string) {
  return nombre
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
