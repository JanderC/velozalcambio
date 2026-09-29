import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ETIQUETA_TIPO_CUENTA, getCuentasTercero, type CuentaTercero } from "../../api/cuentasTercero.api";
import { Modal } from "../../components/common/Modal";
import { CuentaClienteForm } from "./CuentaClienteForm";
import { datoPrincipalCuenta } from "./CuentasCliente";
import "./cuentasCliente.css";

// "Cuenta del cliente" en las pantallas de cambio, cuando se le paga por transferencia.
// Solo lista cuentas activas; las de la moneda que recibe el cliente van primero.
export function SelectorCuentaCliente({
  terceroId,
  titularSugerido,
  monedaCodigo,
  monedaId,
  value,
  onChange,
}: {
  terceroId: number;
  titularSugerido?: string;
  // Moneda que recibe el cliente, para ordenar y para sugerirla al crear una cuenta
  monedaCodigo?: string;
  monedaId?: number;
  value: number | "";
  onChange: (cuentaId: number | "") => void;
}) {
  const [cuentas, setCuentas] = useState<CuentaTercero[] | null>(null);
  const [version, setVersion] = useState(0);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    let vigente = true;
    getCuentasTercero(terceroId)
      .then((c) => { if (vigente) setCuentas(c); })
      .catch(() => { if (vigente) setCuentas([]); });
    return () => { vigente = false; };
  }, [terceroId, version]);

  // Si la cuenta elegida ya no está en la lista (otro cliente, desactivada), se limpia.
  useEffect(() => {
    if (cuentas && value !== "" && !cuentas.some((c) => c.id === value)) onChange("");
  }, [cuentas, value, onChange]);

  const ordenadas = [...(cuentas ?? [])].sort((a, b) => {
    const pa = a.moneda_codigo === monedaCodigo ? 0 : a.moneda_codigo == null ? 1 : 2;
    const pb = b.moneda_codigo === monedaCodigo ? 0 : b.moneda_codigo == null ? 1 : 2;
    return pa - pb;
  });

  function etiqueta(c: CuentaTercero) {
    const partes = [c.alias ?? ETIQUETA_TIPO_CUENTA[c.tipo], c.banco, datoPrincipalCuenta(c)].filter(Boolean);
    return `${partes.join(" · ")}${c.moneda_codigo ? ` (${c.moneda_codigo})` : ""} — ${c.titular}`;
  }

  return (
    <div className="cta-selector">
      <div className="cta-selector-fila">
        <select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} disabled={cuentas === null}>
          <option value="">{cuentas === null ? "Cargando…" : cuentas.length === 0 ? "El cliente no tiene cuentas" : "Seleccionar cuenta…"}</option>
          {ordenadas.map((c) => <option key={c.id} value={c.id}>{etiqueta(c)}</option>)}
        </select>
        <button type="button" className="cta-btn-mini" onClick={() => setCreando(true)}>
          <Plus size={13} /> Nueva cuenta
        </button>
      </div>

      {creando && (
        <Modal titulo="Nueva cuenta del cliente" onCerrar={() => setCreando(false)}>
          <CuentaClienteForm
            terceroId={terceroId}
            titularSugerido={titularSugerido}
            monedaSugeridaId={monedaId}
            onGuardado={(c) => {
              setCreando(false);
              // Se agrega ya a la lista para que la limpieza de arriba no la descarte mientras se recarga
              setCuentas((prev) => [...(prev ?? []), c]);
              setVersion((v) => v + 1);
              onChange(c.id);
            }}
            onCancelar={() => setCreando(false)}
          />
        </Modal>
      )}
    </div>
  );
}
