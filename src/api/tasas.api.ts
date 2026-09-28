import { api } from "./client";

export interface TasaPublica {
  moneda_origen: string;
  moneda_destino: string;
  valor: string;
  vigente_desde: string;
}

export interface TasaHistorial {
  id: number;
  moneda_origen_codigo: string;
  moneda_destino_codigo: string;
  valor: string;
  vigente_desde: string;
  creado_por_nombre: string;
}

export interface TasaExterna {
  origen: "DolarApi" | "MontosVE";
  fuente: string;
  moneda: string;
  compra: number | null;
  venta: number | null;
  promedio: number | null;
  fechaActualizacion: string | null;
}

export interface HistoricoDia {
  fecha: string;
  oficial: number | null;
  paralelo: number | null;
}

export interface MetricasMercado {
  oficialActual: number | null;
  paraleloActual: number | null;
  brechaPct: number | null;
  variacionOficial7d: number | null;
  variacionParalelo7d: number | null;
}

export interface TrmHistoricoDia {
  fecha: string;
  valor: number;
}

export interface TrmColombiaData {
  actual: { valor: number; fechaActualizacion: string } | null;
  historico: TrmHistoricoDia[];
  variacionDiaAnteriorPct: number | null;
  variacion7dPct: number | null;
  variacion30dPct: number | null;
}

export interface CotizacionDetalle {
  id: number;
  moneda_id: number;
  moneda_codigo: string;
  tipo: "COMPRA" | "VENTA";
  categoria: "EFECTIVO" | "GIRO";
  etiqueta: string;
  valor: string | null;
  ajuste_pct: string | null;
  vigente_desde: string;
}

export function getCotizacionesDetalle() {
  return api.get<CotizacionDetalle[]>("/tasas/detalle");
}

export function registrarCotizacionDetalle(data: {
  monedaId: number;
  tipo: "COMPRA" | "VENTA";
  categoria: "EFECTIVO" | "GIRO";
  etiqueta: string;
  valor?: string;
  ajustePct?: string;
}) {
  return api.post<CotizacionDetalle>("/tasas/detalle", data);
}

export function getTrmColombia() {
  return api.get<TrmColombiaData>("/tasas/trm-colombia");
}

export function getHistoricoMercado(dias: number) {
  return api.get<{ historico: HistoricoDia[]; metricas: MetricasMercado }>(`/tasas/historico-mercado?dias=${dias}`);
}

export function getTasasExternas() {
  return api.get<TasaExterna[]>("/tasas/externas");
}

export function getTasasPublicas() {
  return api.get<TasaPublica[]>("/tasas/publicas");
}

export function getTasasHistorial() {
  return api.get<TasaHistorial[]>("/tasas");
}

export function registrarTasa(data: { monedaOrigenId: number; monedaDestinoId: number; valor: string }) {
  return api.post<TasaHistorial>("/tasas", data);
}