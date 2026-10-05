import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { getTableroCajas, type CajaTablero } from "../../api/cajas.api";
import { useAuth } from "../../auth/useAuth";
import { Modal } from "../../components/common/Modal";
import { CajaForm } from "../cajas/CajaForm";
import { formatearMonto } from "../../utils/montos";
import "../cajas/cajas.css";

// Lo que se muestra de cada caja, siempre las tres: dólares, bolívares y pesos
const MONEDAS: { codigo: string; nombre: string; antes: string; despues: string }[] = [
  { codigo: "USD", nombre: "Dólares", antes: "", despues: " USD" },
  { codigo: "VES", nombre: "Bolívares", antes: "Bs. ", despues: "" },
  { codigo: "COP", nombre: "Pesos", antes: "$", despues: "" },
];

/** Las cajas y cuánto tiene cada una en dólares, bolívares y pesos. Son las mismas cajas del módulo Cajas. */
// version: cuando cambia (p. ej. tras cargar un movimiento) se vuelven a pedir los saldos
export function CajasResumen({ version }: { version?: unknown }) {
  const { usuario } = useAuth();
  const puedeVer = usuario?.rol === "ADMIN" || usuario?.rol === "CAJERO";
  const [cajas, setCajas] = useState<CajaTablero[]>([]);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!puedeVer) return;
    getTableroCajas()
      .then((lista) => {
        setCajas(lista);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer, version]);

  useEffect(cargar, [cargar]);

  if (!puedeVer) return null;

  return (
    <section className="cc-cajas" aria-label="Cajas">
      <div className="cc-cajas-cabeza">
        <h2>Cajas</h2>
        {usuario?.rol === "ADMIN" && (
          <button className="cc-btn-secundario" onClick={() => setCreando(true)}>
            <Plus size={14} /> Nueva caja
          </button>
        )}
      </div>
      {error && <p className="cc-form-error">{error}</p>}
      {cajas.length === 0 && !error && <p className="cc-lista-aviso">Todavía no hay cajas. Creá la primera con «Nueva caja».</p>}
      <div className="cc-cajas-lista">
        {cajas.map((caja) => (
          // Al tocarla se entra a la caja: sus saldos y todos sus movimientos
          <Link key={caja.id} to={`/cajas/${caja.id}`} className="cc-caja" title="Entrar a la caja">
            <h3>
              {caja.nombre} <ChevronRight size={16} />
            </h3>
            <dl>
              {MONEDAS.map((m) => {
                const monto = caja.saldos.find((s) => s.moneda_codigo === m.codigo)?.monto ?? "0";
                return (
                  <div key={m.codigo}>
                    <dt>{m.nombre}</dt>
                    <dd className={/[1-9]/.test(monto) ? "" : "vacio"}>
                      {m.antes}
                      {formatearMonto(monto)}
                      {m.despues}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Link>
        ))}
      </div>

      {creando && (
        <Modal titulo="Nueva caja" onCerrar={() => setCreando(false)}>
          <CajaForm
            onCancelar={() => setCreando(false)}
            onGuardada={() => {
              setCreando(false);
              cargar();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
