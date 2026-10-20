// El mensaje que se le envía al cliente cuando la taquilla confirma o entrega: corto, claro y siempre igual.
const fechaHora = () => new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });

export function mensajeParaCliente(d: { nombre: string | null; que: "entregada" | "confirmada" | "lista"; detalle: string[]; referencia?: string | null }) {
  const saludo = d.nombre?.trim() ? `Hola ${d.nombre.trim().split(/\s+/)[0]} 👋` : "Hola 👋";
  const estado =
    d.que === "entregada" ? "Su transacción fue *entregada* ✅" : d.que === "confirmada" ? "Su transacción fue *confirmada* ✅" : "Su transferencia fue *confirmada* ✅ Ya puede pasar a retirar.";
  return [
    saludo,
    estado,
    "",
    ...d.detalle.filter(Boolean),
    d.referencia ? `Ref: ${d.referencia}` : "",
    `Fecha: ${fechaHora()}`,
    "",
    "¡Gracias por confiar en Veloz al Cambio!",
  ]
    .filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0))
    .join("\n");
}
