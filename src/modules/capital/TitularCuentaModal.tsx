import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import type { BancoDelSistema } from "../../api/capital.api";
import { contratosApi, type Firma, type LinkFirma } from "../../api/contratos.api";
import { CajaLink } from "../cuentasCorrientes/contrato/CajaLink";
import { FirmaControl } from "../cuentasCorrientes/contrato/FirmaControl";

/**
 * El titular de una cuenta de la empresa (la persona dueña de la cuenta): firma una vez y en los contratos con los
 * clientes que depositaron en esta cuenta va como EL COMISIONISTA, con sus datos y su firma. Se le manda un link para
 * que firme desde el teléfono, o se carga aquí.
 */
export function TitularCuentaModal({ banco, onCerrar }: { banco: BancoDelSistema; onCerrar: () => void }) {
  const [firma, setFirma] = useState<Firma | null | undefined>(undefined);
  const [links, setLinks] = useState<LinkFirma[]>([]);
  const [cargando, setCargando] = useState(false);
  const [aMano, setAMano] = useState(false);
  const [datos, setDatos] = useState({ nombre: "", cedula: "", rif: "", ciudad: "", municipio: "", estado: "Táchira" });
  const [error, setError] = useState<string | null>(null);
  // el pago móvil de la cuenta: suele ser el teléfono del titular (para mandarle el link por WhatsApp)
  const pago = banco.datos?.find((d) => d.tipo === "PAGO_MOVIL")?.telefono;
  const telefono = pago ? `58${pago}` : null;

  const cargar = useCallback(async () => {
    const [f, l] = await Promise.all([contratosApi.firmas({ tipo: "COMISIONISTA", cajaId: banco.id }), contratosApi.links({ cajaId: banco.id })]);
    setFirma(f[0] ?? null);
    setLinks(l);
    if (f[0]) setDatos({ nombre: f[0].nombre, cedula: f[0].cedula ?? "", rif: f[0].datos?.rif ?? "", ciudad: f[0].datos?.ciudad ?? "", municipio: f[0].datos?.municipio ?? "", estado: f[0].datos?.estado ?? "Táchira" });
  }, [banco.id]);
  useEffect(() => {
    cargar().catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar el titular."));
  }, [cargar]);
  const pendiente = links.find((l) => l.estado === "PENDIENTE") ?? null;
  // mientras el link no se firme, se mira cada 10 s
  useEffect(() => {
    if (!pendiente) return;
    const t = setInterval(() => void cargar().catch(() => {}), 10_000);
    return () => clearInterval(t);
  }, [pendiente, cargar]);

  async function pedirLink() {
    setError(null);
    setCargando(true);
    try {
      await contratosApi.crearLink({ tipo: "COMISIONISTA", cajaId: banco.id });
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el link.");
    } finally {
      setCargando(false);
    }
  }

  async function guardarAqui(imagen: string | null) {
    setError(null);
    if (!imagen) return;
    if (datos.nombre.trim().split(/\s+/).length < 2 || !datos.cedula.replace(/\D/g, "")) return setError("Escribí el nombre y apellido y la cédula del titular antes de cargar la firma.");
    try {
      await contratosApi.guardarFirma({
        tipo: "COMISIONISTA",
        cajaId: banco.id,
        nombre: datos.nombre.trim(),
        cedula: datos.cedula.trim(),
        datos: { rif: datos.rif.trim() || null, ciudad: datos.ciudad.trim() || null, municipio: datos.municipio.trim() || null, estado: datos.estado.trim() || null },
        imagen,
      });
      setAMano(false);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la firma.");
    }
  }

  const campo = (k: keyof typeof datos, etiqueta: string, placeholder = "") => (
    <label>
      {etiqueta}
      <input value={datos[k]} onChange={(e) => setDatos({ ...datos, [k]: e.target.value })} placeholder={placeholder} />
    </label>
  );

  return (
    <Modal titulo={`Titular de la cuenta · ${banco.nombre}`} onCerrar={onCerrar}>
      <div className="cc-modal cap-titular">
        <p className="cc-modal-nota">
          La persona dueña de esta cuenta firma una vez. En los contratos con los clientes que depositaron aquí va como <b>EL COMISIONISTA</b>, con sus datos y su firma.
        </p>
        {firma === undefined ? (
          <p className="cap-vacio">Cargando…</p>
        ) : firma ? (
          <div className="cap-titular-ficha">
            <img src={firma.imagen} alt={`Firma de ${firma.nombre}`} />
            <div>
              <b>{firma.nombre}</b>
              <span>C.I. {firma.cedula ?? "—"}{firma.datos?.rif ? ` · RIF ${firma.datos.rif}` : ""}</span>
              <span>{[firma.datos?.ciudad, firma.datos?.municipio ? `Municipio ${firma.datos.municipio}` : null, firma.datos?.estado].filter(Boolean).join(", ") || "Sin domicilio"}</span>
              <small>
                Firmó el {new Date(firma.created_at).toLocaleDateString("es-CO")} · {firma.origen === "LINK" ? "por el link" : "cargada en el sistema"}
              </small>
            </div>
          </div>
        ) : (
          <p className="cap-titular-falta">Esta cuenta todavía no tiene la firma de su titular.</p>
        )}

        {pendiente ? (
          <CajaLink link={pendiente} telefono={telefono} para={pendiente.nombre ?? ""} mensaje={`para los contratos de Pago Veloz al Cambio necesitamos tu firma como titular de la cuenta ${banco.nombre}`} />
        ) : (
          <button type="button" className="cc-pedir-link" onClick={() => void pedirLink()} disabled={cargando}>
            <Link2 size={13} /> {firma ? "Link para que vuelva a firmar" : "Link para que firme el titular"}
          </button>
        )}
        {pendiente && (
          <button type="button" className="cc-firmas-actualizar" onClick={() => void cargar()}>
            <RefreshCw size={12} /> Ver si ya firmó
          </button>
        )}

        {!aMano ? (
          <button type="button" className="cc-btn-secundario" onClick={() => setAMano(true)}>
            {firma ? "Cambiar los datos o la firma aquí" : "O cargar los datos y la firma aquí"}
          </button>
        ) : (
          <fieldset className="cap-titular-mano">
            <legend>Datos del titular (van en el contrato)</legend>
            <div className="cc-contrato-grilla">
              {campo("nombre", "Nombre y apellido")}
              {campo("cedula", "Cédula", "V-12.345.678")}
              {campo("rif", "RIF", "J-12.345.678-9")}
              {campo("ciudad", "Ciudad", "Rubio")}
              {campo("municipio", "Municipio", "Junin")}
              {campo("estado", "Estado", "Táchira")}
            </div>
            <FirmaControl titulo="Firma del titular" valor={null} onCambio={(v) => void guardarAqui(v)} ayuda="Al subirla o dibujarla queda guardada con estos datos." />
          </fieldset>
        )}
        {error && <p className="cc-form-error">{error}</p>}
      </div>
    </Modal>
  );
}
