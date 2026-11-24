import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, PenLine } from "lucide-react";
import { ApiError } from "../../api/client";
import { contratosApi, type LinkPublico } from "../../api/contratos.api";
import { Lienzo, limpiarFirma } from "../cuentasCorrientes/contrato/FirmaControl";
import "./contratos.css";

/**
 * La página del link para firmar (se abre sin iniciar sesión, desde el teléfono): quien recibe el link ve para qué es,
 * escribe o confirma su nombre y cédula, firma con el dedo y listo. La firma queda guardada a su nombre.
 */
export function FirmarPage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<LinkPublico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [cuenta, setCuenta] = useState("");
  // el titular de una cuenta de la empresa (EL COMISIONISTA): sus datos van en el contrato
  const [rif, setRif] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [estado, setEstado] = useState("Táchira");
  const [firma, setFirma] = useState<string | null>(null);
  const [dibujando, setDibujando] = useState(true);
  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    contratosApi
      .linkPublico(token)
      .then((i) => {
        setInfo(i);
        setNombre(i.nombre ?? "");
        setCedula(i.cedula ?? "");
        setCuenta(i.numeroCuenta ?? "");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo abrir el link. Revisá la conexión."));
  }, [token]);

  async function enviar() {
    if (!firma) return setError("Firmá en el recuadro.");
    if (nombre.trim().split(/\s+/).length < 2) return setError("Escribí tu nombre y apellido.");
    if (!cedula.replace(/\D/g, "")) return setError("Escribí tu número de cédula.");
    if (info?.tipo === "COMISIONISTA" && !ciudad.trim()) return setError("Escribí la ciudad donde vivís (va en el contrato).");
    if (!acepto) return setError("Marcá que estás de acuerdo para firmar.");
    setError(null);
    setEnviando(true);
    try {
      await contratosApi.firmarPublico(token, {
        imagen: firma,
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        numeroCuenta: cuenta.trim() || undefined,
        ...(info?.tipo === "COMISIONISTA" ? { datos: { rif: rif.trim() || null, ciudad: ciudad.trim() || null, municipio: municipio.trim() || null, estado: estado.trim() || null } } : {}),
      });
      setListo(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la firma. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const esTitular = info?.tipo === "TITULAR";
  const esComisionista = info?.tipo === "COMISIONISTA";
  return (
    <div className="fp-pagina">
      <div className="fp-caja">
        <header>
          <PenLine size={22} />
          <div>
            <h1>Firma del contrato</h1>
            <p>Pago Veloz al Cambio</p>
          </div>
        </header>

        {listo ? (
          <div className="fp-listo">
            <CheckCircle2 size={40} />
            <h2>¡Listo, {nombre.split(/\s+/)[0]}!</h2>
            <p>Tu firma quedó registrada. Ya podés cerrar esta página.</p>
          </div>
        ) : !info ? (
          error ? <p className="fp-error">{error}</p> : <p className="fp-cargando">Cargando…</p>
        ) : (
          <>
            <p className="fp-texto">
              {esComisionista ? (
                <>
                  Vas a firmar como <b>titular de la cuenta {info.cuenta}</b> de Pago Veloz al Cambio. Tu firma y tus datos van como <b>EL COMISIONISTA</b> en los contratos de comisión con los
                  clientes que depositan en esa cuenta.
                </>
              ) : esTitular ? (
                <>
                  Vas a firmar como <b>titular de la cuenta que recibe el dinero</b>
                  {info.cliente ? (
                    <>
                      {" "}
                      de la operación de <b>{info.cliente}</b>
                    </>
                  ) : null}
                  , para el contrato de comisión y su finiquito.
                </>
              ) : (
                <>
                  Vas a firmar el <b>contrato de comisión</b> (intermediación) y sus finiquitos con Pago Veloz al Cambio.
                </>
              )}{" "}
              Tu firma queda guardada para estos documentos.
            </p>
            <label>
              Nombre y apellido
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} readOnly={!esTitular && !esComisionista && !!info.nombre} autoComplete="name" />
            </label>
            <label>
              Cédula
              <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" readOnly={!esTitular && !esComisionista && !!info.cedula} placeholder="V-12345678" />
            </label>
            {esComisionista && (
              <>
                <label>
                  RIF
                  <input value={rif} onChange={(e) => setRif(e.target.value)} placeholder="J-12.345.678-9" />
                </label>
                <label>
                  Ciudad donde vivís
                  <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="ej. Rubio" />
                </label>
                <label>
                  Municipio
                  <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="ej. Junin" />
                </label>
                <label>
                  Estado
                  <input value={estado} onChange={(e) => setEstado(e.target.value)} />
                </label>
              </>
            )}
            {esTitular && (
              <label>
                Número de cuenta donde recibís {info.banco ? `(${info.banco})` : ""}
                <input value={cuenta} onChange={(e) => setCuenta(e.target.value)} inputMode="numeric" placeholder="opcional" />
              </label>
            )}
            <div className="fp-firma">
              <span>Firma aquí con el dedo</span>
              {dibujando ? (
                <Lienzo
                  onListo={async (url) => {
                    if (!url) return;
                    const limpia = await limpiarFirma(url).catch(() => null);
                    if (limpia) {
                      setFirma(limpia);
                      setDibujando(false);
                    }
                  }}
                />
              ) : (
                <>
                  <img src={firma ?? ""} alt="Tu firma" />
                  <button type="button" className="fp-secundario" onClick={() => setDibujando(true)}>
                    Volver a firmar
                  </button>
                </>
              )}
            </div>
            <label className="fp-acepto">
              <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
              {esComisionista
                ? "Estoy de acuerdo y autorizo que esta firma y mis datos se usen como EL COMISIONISTA en los contratos y finiquitos de los clientes que depositan en esta cuenta."
                : "Estoy de acuerdo y autorizo que esta firma se use en el contrato y sus finiquitos."}
            </label>
            {error && <p className="fp-error">{error}</p>}
            <button type="button" className="fp-enviar" onClick={() => void enviar()} disabled={enviando || !firma}>
              {enviando ? "Guardando…" : "Enviar firma"}
            </button>
            <small className="fp-vence">Este link sirve una sola vez y vence el {new Date(info.expira).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" })}.</small>
          </>
        )}
      </div>
    </div>
  );
}
