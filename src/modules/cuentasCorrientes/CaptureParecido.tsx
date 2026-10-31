// Antes de registrar: si la referencia se parece a la de otro movimiento, o hay una operación igual, se muestran los dos
// captures lado a lado para que quien registra compare. Un error aquí descuadra la caja y el saldo del cliente.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ImageOff } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { buscarCapturasParecidas, getUrlComprobante, getUrlComprobanteTransferencia, type CaptureParecido } from "../../api/cuentasCorrientes.api";
import { formatearMonto } from "../../utils/montos";

const dinero = (valor: string, moneda: string) => {
  const numero = formatearMonto(valor.replace(/^-/, ""));
  return moneda === "COP" ? `$${numero}` : `${numero} ${moneda}`;
};
const cuando = (fecha: string) => new Date(fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

interface Revision {
  parecidos: CaptureParecido[];
  imagenes: File[];
  resolver: (seguir: boolean) => void;
}

/** Las imágenes de la captura que se está registrando. */
function CapturasNuevas({ imagenes }: { imagenes: File[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const creadas = imagenes.map((i) => URL.createObjectURL(i));
    setUrls(creadas);
    return () => creadas.forEach((u) => URL.revokeObjectURL(u));
  }, [imagenes]);
  if (!urls.length) {
    return (
      <div className="cc-parecido-vacio">
        <ImageOff size={22} aria-hidden="true" /> No se cargó imagen: la referencia se escribió a mano.
      </div>
    );
  }
  return (
    <>
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" title="Abrir en grande">
          <img src={u} alt={`Capture nuevo ${i + 1}`} />
        </a>
      ))}
    </>
  );
}

/** El capture guardado con el movimiento que se parece. */
function CaptureGuardado({ parecido }: { parecido: CaptureParecido }) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "sin">(parecido.tiene_comprobante ? "cargando" : "sin");
  useEffect(() => {
    setUrl(null);
    if (!parecido.tiene_comprobante) return setEstado("sin");
    setEstado("cargando");
    let vigente = true;
    (parecido.transferencia_id ? getUrlComprobanteTransferencia(parecido.transferencia_id) : getUrlComprobante(parecido.id))
      .then((u) => {
        if (!vigente) return;
        setUrl(u);
        setEstado("listo");
      })
      .catch(() => vigente && setEstado("sin"));
    return () => {
      vigente = false;
    };
  }, [parecido]);
  if (estado === "cargando") return <div className="cc-parecido-vacio">Buscando el capture…</div>;
  if (!url) {
    return (
      <div className="cc-parecido-vacio">
        <ImageOff size={22} aria-hidden="true" /> Ese movimiento no tiene el capture guardado.
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Abrir en grande">
      <img src={url} alt="Capture ya registrado" />
    </a>
  );
}

function CaptureParecidoModal({ revision }: { revision: Revision }) {
  const { parecidos, imagenes, resolver } = revision;
  const [indice, setIndice] = useState(0);
  const p = parecidos[indice]!;
  const bloquea = parecidos.some((x) => x.bloquea);
  return (
    <Modal titulo={bloquea ? "Esta referencia ya está registrada" : "Revisá si es el mismo capture"} ancho="ancho" onCerrar={() => resolver(false)}>
      <div className="cc-parecido">
        <div className={`cc-parecido-aviso ${bloquea ? "bloquea" : ""}`}>
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            {bloquea
              ? "Ya hay un movimiento con esta misma referencia en este medio. No se puede registrar dos veces."
              : p.exacta
                ? "Este número ya está en otro movimiento. Bancolombia repite números entre cuentas: compará los dos captures."
                : p.referencia
                  ? "Hay un movimiento con una referencia parecida. Compará los dos captures antes de seguir."
                  : "Hay una operación igual en las últimas 24 horas. Compará los dos captures antes de seguir."}
            {" "}Todavía no se registró nada.
          </span>
        </div>
        {parecidos.length > 1 && (
          <div className="cc-parecido-opciones" role="tablist" aria-label="Movimientos parecidos">
            {parecidos.map((x, i) => (
              <button key={`${x.id}-${x.transferencia_id ?? 0}`} type="button" role="tab" aria-selected={i === indice} className={i === indice ? "activa" : ""} onClick={() => setIndice(i)}>
                {x.tercero_nombre} · {dinero(x.monto, x.moneda_codigo)}
              </button>
            ))}
          </div>
        )}
        <div className="cc-parecido-columnas">
          <section>
            <h4>Lo que estás registrando</h4>
            <div className="cc-parecido-imagen">
              <CapturasNuevas imagenes={imagenes} />
            </div>
          </section>
          <section>
            <h4>Ya registrado</h4>
            <div className="cc-parecido-imagen">
              <CaptureGuardado parecido={p} />
            </div>
            <dl>
              <div>
                <dt>Cliente</dt>
                <dd>{p.tercero_nombre}</dd>
              </div>
              <div>
                <dt>Monto</dt>
                <dd>{dinero(p.monto, p.moneda_codigo)}</dd>
              </div>
              {p.referencia && (
                <div>
                  <dt>Referencia</dt>
                  <dd>{p.referencia}</dd>
                </div>
              )}
              <div>
                <dt>Fecha</dt>
                <dd>{cuando(p.fecha)}</dd>
              </div>
              <div>
                <dt>Medio</dt>
                <dd>{p.canal_nombre.replace(/_/g, " ")}</dd>
              </div>
              {p.registrado_por && (
                <div>
                  <dt>Registró</dt>
                  <dd>{p.registrado_por}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
        <div className="cc-form-acciones">
          {bloquea ? (
            <button type="button" className="cc-guardar" autoFocus onClick={() => resolver(false)}>
              Entendido
            </button>
          ) : (
            <>
              <button type="button" className="cc-btn-secundario" onClick={() => resolver(true)}>
                Es otro capture, registrar
              </button>
              <button type="button" className="cc-guardar" autoFocus onClick={() => resolver(false)}>
                Es el mismo, no registrar
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Revisa las referencias antes de registrar. revisar() responde true si se puede seguir: no hay nada parecido, o quien
 * registra comparó los captures y dijo que es otro.
 */
export function useCaptureParecido() {
  const [revision, setRevision] = useState<Revision | null>(null);
  const mostrar = useCallback(async (parecidos: CaptureParecido[], imagenes: File[]) => {
    if (!parecidos.length) return true;
    const seguir = await new Promise<boolean>((resolver) => setRevision({ parecidos, imagenes, resolver }));
    setRevision(null);
    return seguir;
  }, []);
  const revisar = useCallback(
    async (numeros: string[], canalId: number | undefined, imagenes: File[]) => {
      const listas = await Promise.all(numeros.map((n) => buscarCapturasParecidas(n, canalId).catch(() => [] as CaptureParecido[])));
      const unicos = new Map(listas.flat().map((p) => [`${p.id}-${p.transferencia_id ?? 0}`, p]));
      return mostrar([...unicos.values()].sort((a, b) => Number(b.bloquea) - Number(a.bloquea) || Number(b.exacta) - Number(a.exacta)).slice(0, 4), imagenes);
    },
    [mostrar]
  );
  return { revisar, mostrar, modal: revision ? <CaptureParecidoModal revision={revision} /> : null };
}
