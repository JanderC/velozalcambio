// Los stickers del negocio: los que se mandan al confirmar una transferencia. El id es el que entiende el servidor
// (que guarda la misma imagen en el formato de WhatsApp); acá va la copia para mostrarlos en el selector.
import pago from "../../assets/stickers/pago.webp";
import pagosYSalvos from "../../assets/stickers/pagos-y-salvos.webp";

export const STICKERS_WA: { id: string; nombre: string; src: string }[] = [
  { id: "pago", nombre: "Pago", src: pago },
  { id: "pagos-y-salvos", nombre: "Pagos y Salvos", src: pagosYSalvos },
];
