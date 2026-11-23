import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileUp, Search } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { capitalApi, type BancoDelSistema, type LibroBanco, type RevisionExtracto } from "../../api/capital.api";
import { formatearMonto } from "../../utils/montos";

const dinero = (monto: string | number, codigo: string) => {
  const n = formatearMonto(Number(monto).toFixed(2));
  return codigo === "COP" ? `$${formatearMonto(String(Math.round(Number(monto))))}` : codigo === "VES" ? `Bs. ${n}` : `${n} ${codigo}`;
};
const diaCorto = (iso: string) => {
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a?.slice(2)}`;
};
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

/**
 * El libro contable de una cuenta de banco: qué entró y qué salió, de qué cliente, quién lo registró y con qué
 * referencia; y cargar el estado de cuenta del banco (PDF o MD) para que el libro quede igual que el banco.
 */
export function LibroBancoModal({ banco, onCambio, onCerrar }: { banco: BancoDelSistema; onCambio: () => void; onCerrar: () => void }) {
  const [vista, setVista] = useState<"libro" | "extracto">("libro");
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoy());
  const [buscar, setBuscar] = useState("");
  const [libro, setLibro] = useState<LibroBanco | null>(null);
  const [error, setError] = useState<string | null>(null);
  const moneda = banco.moneda ?? "COP";

  const cargar = useCallback(async () => {
    try {
      setLibro(await capitalApi.libroBanco(banco.id, { desde, hasta, buscar: buscar.trim() || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el libro.");
    }
  }, [banco.id, desde, hasta, buscar]);
  useEffect(() => {
    const t = setTimeout(() => void cargar(), buscar ? 350 : 0);
    return () => clearTimeout(t);
  }, [cargar, buscar]);

  return (
    <Modal titulo={`Libro contable · ${banco.nombre}`} ancho="ancho" onCerrar={onCerrar}>
      <div className="lb">
        <div className="lb-pestanas" role="tablist">
          <button type="button" role="tab" aria-selected={vista === "libro"} className={vista === "libro" ? "activo" : ""} onClick={() => setVista("libro")}>
            Qué entra y qué sale
          </button>
          <button type="button" role="tab" aria-selected={vista === "extracto"} className={vista === "extracto" ? "activo" : ""} onClick={() => setVista("extracto")}>
            <FileUp size={14} /> Cargar estado de cuenta
          </button>
          {libro && (
            <span className="lb-saldo">
              Saldo en el sistema: <b>{dinero(libro.caja.saldo, moneda)}</b>
            </span>
          )}
        </div>

        {vista === "libro" ? (
          <>
            <div className="lb-filtros">
              <label>
                Desde
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
              <label className="lb-buscar">
                <Search size={14} />
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Referencia, cliente, quién lo hizo…" aria-label="Buscar en el libro" />
              </label>
            </div>
            {error && <p className="cc-form-error">{error}</p>}
            {libro && (
              <>
                <div className="lb-totales">
                  <span>
                    Entró <b className="cap-pos">{dinero(libro.totales.entra, moneda)}</b>
                  </span>
                  <span>
                    Salió <b className="cap-neg">{dinero(libro.totales.sale, moneda)}</b>
                  </span>
                  <span>{libro.totales.cantidad} movimientos</span>
                  {libro.ultimoExtracto && (
                    <span className="lb-ultimo">
                      Último estado de cuenta: hasta {diaCorto(libro.ultimoExtracto.hasta ?? libro.ultimoExtracto.created_at)}
                    </span>
                  )}
                </div>
                <div className="lb-tabla">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Referencia</th>
                        <th>Qué fue</th>
                        <th>Quién</th>
                        <th className="num">Entra</th>
                        <th className="num">Sale</th>
                        <th className="num">Saldo</th>
                        <th title="Aparece en el estado de cuenta del banco">Banco</th>
                      </tr>
                    </thead>
                    <tbody>
                      {libro.filas.length === 0 && (
                        <tr>
                          <td colSpan={8} className="cap-vacio">
                            No hay movimientos en esas fechas.
                          </td>
                        </tr>
                      )}
                      {libro.filas.map((f) => {
                        // en las fechas del último estado de cuenta, lo que no aparece en el banco se marca
                        const fueraDelBanco =
                          !f.en_extracto && !!libro.ultimoExtracto?.desde && !!libro.ultimoExtracto?.hasta && f.dia.slice(0, 10) >= libro.ultimoExtracto.desde.slice(0, 10) && f.dia.slice(0, 10) <= libro.ultimoExtracto.hasta.slice(0, 10);
                        return (
                          <tr key={f.id} className={`${f.anulado ? "lb-anulado" : ""} ${fueraDelBanco ? "lb-fuera" : ""}`}>
                            <td>{diaCorto(f.dia)}</td>
                            <td className="lb-ref">{f.referencia ?? "—"}</td>
                            <td>
                              {f.cliente ? (
                                <>
                                  <b>{f.cliente}</b>
                                  {f.anulado && <small> (anulada)</small>}
                                  <small>{f.detalle_cliente ?? ""}</small>
                                </>
                              ) : (
                                (f.observacion ?? (f.tipo === "INGRESO" ? "Ingreso" : "Egreso"))
                              )}
                              {f.detalle_banco && f.cliente && <small className="lb-banco">Banco: {f.detalle_banco}</small>}
                            </td>
                            <td>{f.usuario ?? "—"}</td>
                            <td className="num cap-pos">{f.tipo === "INGRESO" ? dinero(f.monto, moneda) : ""}</td>
                            <td className="num cap-neg">{f.tipo === "EGRESO" ? dinero(f.monto, moneda) : ""}</td>
                            <td className="num">{dinero(f.saldo_nuevo, moneda)}</td>
                            <td className="lb-estado">
                              {f.en_extracto ? (
                                <span title="Está en el estado de cuenta del banco">
                                  <CheckCircle2 size={15} />
                                </span>
                              ) : fueraDelBanco ? (
                                <span className="lb-no" title="Está en el sistema pero no aparece en el estado de cuenta de esas fechas">
                                  no está
                                </span>
                              ) : (
                                ""
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : (
          <CargarExtracto
            banco={banco}
            onCargado={() => {
              onCambio();
              void cargar();
            }}
          />
        )}
      </div>
    </Modal>
  );
}

/** Cargar el estado de cuenta: se revisa primero (de qué cuenta es, qué es nuevo, si cuadra) y después se carga. */
function CargarExtracto({ banco, onCargado }: { banco: BancoDelSistema; onCargado: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [revision, setRevision] = useState<RevisionExtracto | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [diferencia, setDiferencia] = useState<{ sistema: string; banco: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const moneda = banco.moneda ?? "COP";

  async function revisar(f: File) {
    setArchivo(f);
    setRevision(null);
    setResultado(null);
    setDiferencia(null);
    setError(null);
    setOcupado(true);
    try {
      setRevision(await capitalApi.revisarExtracto(banco.id, f));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo leer el archivo.");
    } finally {
      setOcupado(false);
    }
  }

  async function cargar() {
    if (!archivo || !revision) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await capitalApi.cargarExtracto(banco.id, archivo);
      setResultado(
        `Listo: ${r.nuevos} movimiento(s) nuevos anotados en ${r.cuenta}, ${r.conciliados} ya estaban en el libro y quedaron conciliados${r.yaCargados ? `, ${r.yaCargados} ya se habían cargado antes` : ""}.`
      );
      if (r.saldoFinalExtracto && Math.abs(Number(r.saldoSistema) - Number(r.saldoFinalExtracto)) > 0.005) setDiferencia({ sistema: r.saldoSistema, banco: r.saldoFinalExtracto });
      setRevision(null);
      onCargado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el estado de cuenta.");
    } finally {
      setOcupado(false);
    }
  }

  async function igualarSaldo() {
    if (!diferencia) return;
    setOcupado(true);
    try {
      const r = await capitalApi.cargarSaldoBanco(banco.id, moneda, diferencia.banco);
      setResultado(`El saldo de ${r.cuenta} quedó en ${dinero(r.ahora, moneda)}, igual que el estado de cuenta (antes ${dinero(r.antes, moneda)}).`);
      setDiferencia(null);
      onCargado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo igualar el saldo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="lb-extracto">
      <p className="cc-modal-nota">
        Subí el estado de cuenta del banco en <b>PDF</b> (o el mismo texto en <b>MD</b>). Se cruza con el libro: lo que ya está (una confirmación con su referencia, un
        pago) queda conciliado y lo que falta se anota con su referencia y su fecha. Si lo subís dos veces no se repite nada.
      </p>
      <label className="lb-archivo">
        <FileUp size={16} /> {archivo ? archivo.name : "Elegir el archivo"}
        <input type="file" accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain" onChange={(e) => e.target.files?.[0] && void revisar(e.target.files[0])} hidden />
      </label>
      {ocupado && !revision && <p className="cap-vacio">Leyendo…</p>}
      {error && <p className="cc-form-error">{error}</p>}
      {resultado && <p className="lb-listo">{resultado}</p>}
      {diferencia && (
        <div className="lb-diferencia">
          <span>
            El sistema dice <b>{dinero(diferencia.sistema, moneda)}</b> y el estado de cuenta termina en <b>{dinero(diferencia.banco, moneda)}</b>.
          </span>
          <button type="button" className="cc-guardar" onClick={() => void igualarSaldo()} disabled={ocupado}>
            Dejar el saldo como el banco
          </button>
        </div>
      )}
      {revision && (
        <>
          <div className="lb-resumen">
            <span>
              Cuenta <b>{revision.cuenta ?? "—"}</b> → {revision.caja.nombre}
            </span>
            <span>
              Del {revision.desde ? diaCorto(revision.desde) : "—"} al {revision.hasta ? diaCorto(revision.hasta) : "—"}
            </span>
            <span>
              Saldo inicial <b>{revision.saldoInicial ? dinero(revision.saldoInicial, moneda) : "—"}</b> · final <b>{revision.saldoFinal ? dinero(revision.saldoFinal, moneda) : "—"}</b>
            </span>
            <span>
              Entró <b className="cap-pos">{dinero(revision.totalCreditos, moneda)}</b> · salió <b className="cap-neg">{dinero(revision.totalDebitos, moneda)}</b>
            </span>
          </div>
          {revision.descuadres.length > 0 ? (
            <p className="cc-form-error">
              Hay {revision.descuadres.length} renglón(es) que no cuadran con el saldo anterior (ej. ref. {revision.descuadres[0]!.referencia}): el archivo no se leyó bien y no se puede cargar.
            </p>
          ) : (
            <p className="lb-cuadra">
              <CheckCircle2 size={15} /> Los {revision.renglones.length} movimientos cuadran con los saldos del banco.
            </p>
          )}
          <div className="lb-conteo">
            <span className="nuevo">{revision.nuevos} nuevos (se anotan)</span>
            <span className="en-libro">{revision.enLibro} ya están en el libro (se concilian)</span>
            {revision.cargados > 0 && <span>{revision.cargados} ya se habían cargado</span>}
          </div>
          <div className="lb-tabla lb-tabla-corta">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Referencia</th>
                  <th>Descripción</th>
                  <th className="num">Entra</th>
                  <th className="num">Sale</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {revision.renglones.map((r, i) => (
                  <tr key={i}>
                    <td>{diaCorto(r.fecha)}</td>
                    <td className="lb-ref">{r.referencia}</td>
                    <td>{r.descripcion}</td>
                    <td className="num cap-pos">{r.tipo === "NC" ? dinero(r.monto, moneda) : ""}</td>
                    <td className="num cap-neg">{r.tipo === "ND" ? dinero(r.monto, moneda) : ""}</td>
                    <td className={`lb-est-${r.estado}`}>{r.estado === "nuevo" ? "Nuevo" : r.estado === "en_libro" ? "En el libro" : "Ya cargado"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cc-form-acciones">
            <button type="button" className="cc-guardar" onClick={() => void cargar()} disabled={ocupado || revision.descuadres.length > 0 || revision.nuevos + revision.enLibro === 0}>
              {ocupado ? "Cargando…" : revision.nuevos + revision.enLibro === 0 ? "Ya está todo cargado" : `Cargar al libro (${revision.nuevos} nuevos, ${revision.enLibro} a conciliar)`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
