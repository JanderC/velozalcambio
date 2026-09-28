import { api } from "./client";

export interface MetodoPago {
  id: number;
  nombre: string;
}

export function getMetodosPago() {
  return api.get<MetodoPago[]>("/metodos-pago");
}