// Confirmaciones: antes de procesar, se frena con un modal si la captura no se leyó bien o si el monto se sale de lo común.
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { formatearMonto } from "../../utils/montos";

// Desde cuánto un monto es muy grande, por moneda
export const MONTO_INUSUAL: Record<string, number> = { COP: 30_000_000, VES: 15_000_000, USD: 10_000, USDT: 10_000, EUR: 10_000 };
const MONTO_INUSUAL_OTRA = 10_000;
// Con este historial en la cuenta se compara también con lo más alto del propio cliente
const MOVIMIENTOS_PARA_COMPARAR = 5;
const VECES_LO_MAS_ALTO = 3;

export interface MontoAVerificar {
  monto: string;
  codigo: string;
}

export interface Verificacion {
  motivos: string[];
  filas: { etiqueta: string; valor: string }[];
  imagenes: File[];
  resolver: (seguir: boolean) => void;
}

/** Por qué estos montos se salen de lo común. historial: los montos de la cuenta, que está en codigoCuenta. */
export function motivosDeMonto(montos: MontoAVerificar[], historial: string[], codigoCuenta: string): string[] {
  const anteriores = historial.map((m) => Math.abs(Number(m))).filter((m) => m > 0);
  const masAlto = anteriores.length >= MOVIMIENTOS_PARA_COMPARAR ? Math.max(...anteriores) : null;
  const motivos: string[] = [];
  for (const { monto, codigo } of montos) {
    const n = Number(monto);
    if (n > (MONTO_INUSUAL[codigo] ?? MONTO_INUSUAL_OTRA)) {
      motivos.push(`${formatearMonto(monto)} ${codigo} es un monto muy grande: ¿no se pegó una referencia donde va la cantidad?`);
    } else if (masAlto !== null && codigo === codigoCuenta && n > masAlto * VECES_LO_MAS_ALTO) {
      motivos.push(`${formatearMonto(monto)} ${codigo} es más del triple de lo más alto de este cliente (${formatearMonto(String(masAlto))} ${codigo}).`);
    }
  }
  return motivos;
}

export function motivoDeLectura(capturas: number): string {
  return capturas === 1 ? "La IA no pudo leer bien la captura." : `La IA no pudo leer bien ${capturas} capturas.`;
}

export function VerificarMontosModal({ verificacion }: { verificacion: Verificacion }) {
  const { motivos, filas, imagenes, resolver } = verificacion;
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const creadas = imagenes.map((i) => URL.createObjectURL(i));
    setUrls(creadas);
    return () => creadas.forEach((u) => URL.revokeObjectURL(u));
  }, [imagenes]);

  return (
    <Modal titulo="Verificá antes de procesar" ancho={imagenes.length ? "ancho" : "angosto"} onCerrar={() => resolver(false)}>
      <div className="cc-verificar">
        <div className="cc-verificar-motivos">
          <AlertTriangle size={18} aria-hidden="true" />
          <ul>
            {motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        <p>Compará los montos con el comprobante. Todavía no se procesó nada.</p>
        <dl>
          {filas.map((f) => (
            <div key={f.etiqueta}>
              <dt>{f.etiqueta}</dt>
              <dd>{f.valor}</dd>
            </div>
          ))}
        </dl>
        {urls.length > 0 && (
          <div className="cc-verificar-capturas">
            {urls.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                <img src={u} alt={`Captura ${i + 1}`} />
              </a>
            ))}
          </div>
        )}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" autoFocus onClick={() => resolver(false)}>
            Corregir
          </button>
          <button type="button" className="cc-guardar" onClick={() => resolver(true)}>
            Los montos están bien, procesar
          </button>
        </div>
      </div>
    </Modal>
  );
}
