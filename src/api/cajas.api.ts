import { api } from "./client";

export interface Caja {
  id: number;
  nombre: string;
  tipo: "FISICA" | "FUERTE" | "BANCO";
}

export function getCajas() {
  return api.get<Caja[]>("/cajas");
}