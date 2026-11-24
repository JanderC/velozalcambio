import { api } from "./client";

export type TipoFirma = "CLIENTE" | "TITULAR" | "EMPRESA" | "COMISIONISTA";
/** Los datos de quien firma como EL COMISIONISTA (titular de una cuenta de la empresa): van en el contrato. */
export interface DatosParte {
  rif?: string | null;
  ciudad?: string | null;
  municipio?: string | null;
  estado?: string | null;
}

/** Una firma guardada (de un cliente, de un titular de cuenta o de la empresa). */
export interface Firma {
  id: number;
  tipo: TipoFirma;
  tercero_id: number | null;
  cliente_nombre?: string | null;
  nombre: string;
  cedula: string | null;
  numero_cuenta: string | null;
  banco: string | null;
  imagen: string; // data:image/png;base64,...
  origen: "LINK" | "PANEL";
  created_at: string;
  caja_id?: number | null; // titular de una cuenta de la empresa (COMISIONISTA)
  caja_nombre?: string | null;
  datos?: DatosParte | null;
}

export interface LinkFirma {
  id: number;
  token: string;
  tipo: "CLIENTE" | "TITULAR" | "COMISIONISTA";
  tercero_id: number | null;
  cliente_nombre: string | null;
  caja_id?: number | null;
  caja_nombre?: string | null;
  nombre: string | null;
  cedula: string | null;
  numero_cuenta: string | null;
  banco: string | null;
  firma_id: number | null;
  expira_en: string;
  firmado_en: string | null;
  created_at: string;
  creado_por: string | null;
  estado: "PENDIENTE" | "FIRMADO" | "VENCIDO";
}

export interface ContratoResumen {
  id: number;
  numero: string | null;
  tercero_id: number | null;
  cliente_nombre: string;
  titular_nombre: string | null;
  comisionista_nombre?: string | null;
  created_at: string;
  hecho_por: string | null;
  firmo_cliente: boolean;
  firmo_titular: boolean;
  firmo_empresa: boolean;
  con_finiquito: boolean;
}

export interface ContratoCompleto {
  id: number;
  numero: string | null;
  tercero_id: number | null;
  cliente_nombre: string;
  titular_nombre: string | null;
  datos: Record<string, unknown>;
  created_at: string;
  firmaCliente: Firma | null;
  firmaTitular: Firma | null;
  firmaEmpresa: Firma | null;
}

/** Lo que ve quien abre el link para firmar (sin iniciar sesión). */
export interface LinkPublico {
  tipo: "CLIENTE" | "TITULAR" | "COMISIONISTA";
  cuenta: string | null; // comisionista: la cuenta de la empresa de la que es titular
  nombre: string | null;
  cedula: string | null;
  numeroCuenta: string | null;
  banco: string | null;
  cliente: string | null;
  expira: string;
}

const q = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const t = p.toString();
  return t ? `?${t}` : "";
};

export const contratosApi = {
  firmas: (f: { tipo?: TipoFirma; terceroId?: number; cajaId?: number; buscar?: string } = {}) => api.get<Firma[]>(`/contratos/firmas${q(f)}`),
  guardarFirma: (d: { tipo: TipoFirma; terceroId?: number | null; cajaId?: number | null; datos?: DatosParte | null; nombre: string; cedula?: string | null; numeroCuenta?: string | null; banco?: string | null; imagen: string }) =>
    api.post<Firma>("/contratos/firmas", d),
  quitarFirma: (id: number) => api.delete<{ quitada: true }>(`/contratos/firmas/${id}`),
  links: (f: { terceroId?: number; cajaId?: number } = {}) => api.get<LinkFirma[]>(`/contratos/links${q(f)}`),
  cuentaDeMovimiento: (movimientoId: number) => api.get<{ cajaId: number | null }>(`/contratos/cuenta-de-movimiento/${movimientoId}`),
  crearLink: (d: { tipo: "CLIENTE" | "TITULAR" | "COMISIONISTA"; terceroId?: number | null; cajaId?: number | null; nombre?: string | null; cedula?: string | null; numeroCuenta?: string | null; banco?: string | null }) =>
    api.post<LinkFirma>("/contratos/links", d),
  contratos: (f: { terceroId?: number; buscar?: string } = {}) => api.get<ContratoResumen[]>(`/contratos${q(f)}`),
  contrato: (id: number) => api.get<ContratoCompleto>(`/contratos/${id}`),
  guardarContrato: (d: {
    terceroId: number;
    numero?: string | null;
    clienteNombre: string;
    titularNombre?: string | null;
    datos: Record<string, unknown>;
    firmaClienteId?: number | null;
    firmaTitularId?: number | null;
    firmaEmpresaId?: number | null;
  }) => api.post<{ id: number; created_at: string }>("/contratos", d),
  linkPublico: (token: string) => api.get<LinkPublico>(`/contratos/publico/${token}`),
  firmarPublico: (token: string, d: { imagen: string; nombre?: string; cedula?: string; numeroCuenta?: string; datos?: DatosParte }) => api.post<{ firmado: true; nombre: string }>(`/contratos/publico/${token}`, d),
};

/** El link que se le manda a quien tiene que firmar. */
export const urlDeFirma = (token: string) => `${window.location.origin}/firmar/${token}`;
