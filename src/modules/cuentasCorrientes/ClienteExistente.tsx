import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { buscarClientesExistentes, type ClienteExistente } from "../../api/cuentasCorrientes.api";

export const NOMBRE_DEL_MODULO: Record<string, string> = { CORRIENTE: "Cuentas Corrientes", POR_COBRAR: "Cuentas por Cobrar", POR_PAGAR: "Cuentas por Pagar", CAJA: "Confirmaciones" };

/**
 * Mientras se escribe el nombre o el teléfono de un cliente nuevo: ¿ya existe en el sistema (en cualquier módulo)?
 * El cliente es uno solo para todo: si ya está, se ofrece traerlo en vez de crear otro igual.
 */
export function useClienteExistente(nombre: string, telefono: string, activo = true) {
  const [lista, setLista] = useState<ClienteExistente[]>([]);
  // los que se marcaron "es otra persona" (solo los de mismo teléfono: el mismo nombre no se puede repetir)
  const [descartados, setDescartados] = useState<number[]>([]);
  useEffect(() => {
    const nom = nombre.trim();
    const tel = telefono.replace(/\D/g, "");
    if (!activo || (nom.length < 3 && tel.length < 7)) return setLista([]);
    let vigente = true;
    const t = setTimeout(() => {
      buscarClientesExistentes(nom, tel)
        .then((l) => vigente && setLista(l))
        .catch(() => vigente && setLista([]));
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [nombre, telefono, activo]);
  const visibles = lista.filter((c) => c.mismo_nombre || !descartados.includes(c.id));
  return { lista: visibles, descartar: (id: number) => setDescartados((d) => [...d, id]) };
}

/** El aviso "este cliente ya existe" con el botón para traer sus datos. */
export function AvisoClienteExistente({
  lista,
  modulo,
  onUsar,
  onDescartar,
}: {
  lista: ClienteExistente[];
  modulo: string;
  onUsar: (c: ClienteExistente) => void;
  onDescartar: (id: number) => void;
}) {
  if (lista.length === 0) return null;
  const aqui = NOMBRE_DEL_MODULO[modulo] ?? "este módulo";
  return (
    <div className="cc-existente" role="status">
      <strong>
        <UserCheck size={15} /> {lista.length === 1 ? "Este cliente ya existe en el sistema" : "Ya hay clientes así en el sistema"}
      </strong>
      {lista.map((c) => {
        const donde = c.modulos.map((m) => NOMBRE_DEL_MODULO[m] ?? m);
        const yaAqui = c.modulos.includes(modulo);
        return (
          <div key={c.id} className="cc-existente-fila">
            <div>
              <b>{c.nombre}</b>
              <small>
                {c.telefono ? `${c.telefono} · ` : ""}
                {donde.length ? `está en ${donde.join(", ")}` : "registrado, sin cuentas abiertas"}
                {" · "}
                {c.mismo_nombre && c.mismo_telefono ? "mismo nombre y teléfono" : c.mismo_nombre ? "mismo nombre" : "mismo teléfono"}
              </small>
            </div>
            <span className="cc-existente-acciones">
              <button type="button" onClick={() => onUsar(c)} title={yaAqui ? `Ya tiene cuenta en ${aqui}: se abre esa` : `Se usa ese mismo cliente y se le abre su cuenta en ${aqui}`}>
                {yaAqui ? "Usar su cuenta de aquí" : "Sí, traer sus datos aquí"}
              </button>
              {!c.mismo_nombre && (
                <button type="button" className="secundario" onClick={() => onDescartar(c.id)} title="Comparten el teléfono pero son personas distintas">
                  Es otra persona
                </button>
              )}
            </span>
          </div>
        );
      })}
      {lista.some((c) => c.mismo_nombre) && <small className="cc-existente-nota">Con el mismo nombre no se crea otro cliente: usá ese, o si es otra persona escribí el nombre distinto (por ejemplo con el apellido).</small>}
    </div>
  );
}
