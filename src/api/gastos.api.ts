import { api } from "./client";

export type CategoriaGasto = "OFICINA" | "DUENO" | "ENTES" | "PAGO_BANCOLOMBIA" | "PAGO_BOLIVARES" | "NOMINA" | "BONO" | "OTRO";

/** Un egreso del negocio que no es operación con clientes: gasto de oficina, sueldo, bono, pago a un ente... */
export interface Gasto {
  id: number;
  periodo: string; // 2026-09
  categoria: CategoriaGasto;
  descripcion: string;
  monto_cop: string;
  monto_usd: string;
  estado: "PENDIENTE" | "PAGADO";
  fecha: string | null; // cuándo se pagó
  fecha_programada: string | null; // cuándo toca (pagos semanales)
  caja_id: number | null;
  caja_nombre: string | null; // de dónde salió la plata
  nota: string | null;
  usuario_nombre: string | null;
  pagado_por_nombre: string | null;
}

/** Lo que se repite: la nómina de cada mes o un pago de cada semana. */
export interface PlantillaGasto {
  id?: number;
  categoria: CategoriaGasto;
  descripcion: string;
  monto_cop: string;
  monto_usd: string;
  frecuencia: "MENSUAL" | "SEMANAL";
  dia_semana: number | null; // 0 domingo ... 6 sábado
}

export interface NuevoGasto {
  periodo: string;
  categoria: CategoriaGasto;
  descripcion: string;
  montoCop?: string;
  montoUsd?: string;
  pagado: boolean;
  fecha?: string;
  cajaId?: number | null;
  nota?: string;
}

export const gastosApi = {
  listar: (periodo: string) => api.get<Gasto[]>(`/gastos?periodo=${periodo}`),
  crear: (g: NuevoGasto) => api.post<{ id: number }>("/gastos", g),
  editar: (id: number, d: { descripcion?: string; categoria?: CategoriaGasto; montoCop?: string; montoUsd?: string; nota?: string }) =>
    api.put<{ id: number }>(`/gastos/${id}`, d),
  pagar: (id: number, d: { fecha?: string; cajaId?: number | null }) => api.post<{ id: number }>(`/gastos/${id}/pagar`, d),
  borrar: (id: number) => api.delete<{ id: number }>(`/gastos/${id}`),
  plantillas: () => api.get<PlantillaGasto[]>("/gastos/plantillas"),
  guardarPlantillas: (filas: PlantillaGasto[]) =>
    api.put<PlantillaGasto[]>("/gastos/plantillas", {
      filas: filas.map((f) => ({
        id: f.id,
        categoria: f.categoria,
        descripcion: f.descripcion,
        montoCop: f.monto_cop,
        montoUsd: f.monto_usd,
        frecuencia: f.frecuencia,
        diaSemana: f.frecuencia === "SEMANAL" ? f.dia_semana : null,
      })),
    }),
  generar: (periodo: string, frecuencia: "MENSUAL" | "SEMANAL") => api.post<{ creados: number }>("/gastos/generar", { periodo, frecuencia }),
};
