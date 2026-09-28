import { api } from "./client";

export interface Moneda {
  id: number;
  codigo: string;
  nombre: string;
}

export function getMonedas() {
  return api.get<Moneda[]>("/monedas");
}