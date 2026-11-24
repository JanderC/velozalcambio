import { api } from "./client";

export type TipoFirma = "CLIENTE" | "TITULAR" | "EMPRESA";

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
}

export interface LinkFirma {
  id: number;
  token: string;
  tipo: "CLIENTE" | "TITULAR";
  tercero_id: number | null;
  cliente_nombre: string | null;
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
  tipo: "CLIENTE" | "TITULAR";
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
  firmas: (f: { tipo?: TipoFirma; terceroId?: number; buscar?: string } = {}) => api.get<Firma[]>(`/contratos/firmas${q(f)}`),
  guardarFirma: (d: { tipo: TipoFirma; terceroId?: number | null; nombre: string; cedula?: string | null; numeroCuenta?: string | null; banco?: string | null; imagen: string }) =>
    api.post<Firma>("/contratos/firmas", d),
  quitarFirma: (id: number) => api.delete<{ quitada: true }>(`/contratos/firmas/${id}`),
  links: (f: { terceroId?: number } = {}) => api.get<LinkFirma[]>(`/contratos/links${q(f)}`),
  crearLink: (d: { tipo: "CLIENTE" | "TITULAR"; terceroId: number; nombre?: string | null; cedula?: string | null; numeroCuenta?: string | null; banco?: string | null }) =>
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
  firmarPublico: (token: string, d: { imagen: string; nombre?: string; cedula?: string; numeroCuenta?: string }) => api.post<{ firmado: true; nombre: string }>(`/contratos/publico/${token}`, d),
};

/** El link que se le manda a quien tiene que firmar. */
export const urlDeFirma = (token: string) => `${window.location.origin}/firmar/${token}`;
