// El mensaje que se le envía al cliente cuando la taquilla confirma o entrega: corto, claro y siempre igual.
//   Hola yiselvanesa 👋
//   Su transacción fue entregada ✅
//
//   Monto: $58.002
//   Entregado en efectivo
//
//   ¡Gracias por confiar en Veloz al Cambio!
export function mensajeParaCliente(d: { nombre: string | null; que: "entregada" | "confirmada" | "lista"; detalle: string[]; referencia?: string | null }) {
  const saludo = d.nombre?.trim() ? `Hola ${d.nombre.trim().split(/\s+/)[0]} 👋` : "Hola 👋";
  const estado =
    d.que === "entregada" ? "Su transacción fue entregada ✅" : d.que === "confirmada" ? "Su transacción fue confirmada ✅" : "Su transferencia fue confirmada ✅ Ya puede pasar a retirar.";
  const detalle = d.detalle.filter(Boolean);
  return [saludo, estado, ...(detalle.length ? ["", ...detalle] : []), "", "¡Gracias por confiar en Veloz al Cambio!"].join("\n");
}
