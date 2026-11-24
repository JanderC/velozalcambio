import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, FileSignature, Search, Trash2, XCircle } from "lucide-react";
import { Header } from "../../components/common/Header";
import { ApiError } from "../../api/client";
import { contratosApi, urlDeFirma, type ContratoResumen, type Firma, type LinkFirma } from "../../api/contratos.api";
import { descargarContrato, type Finiquito, type Parte } from "../cuentasCorrientes/contrato/documentoContrato";
import { firmaParaWord } from "../cuentasCorrientes/contrato/FirmaControl";
import "./contratos.css";

type Vista = "contratos" | "clientes" | "titulares" | "cuentas" | "links";
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" });

/**
 * Contratos: los contratos de comisión que se hicieron (se vuelven a descargar igual, con sus firmas), las firmas de
 * los clientes, las de los titulares de las cuentas que reciben el dinero y los links que se mandaron para firmar.
 */
export function ContratosPage() {
  const [vista, setVista] = useState<Vista>("contratos");
  const [buscar, setBuscar] = useState("");
  const [contratos, setContratos] = useState<ContratoResumen[] | null>(null);
  const [firmas, setFirmas] = useState<Firma[] | null>(null);
  const [empresa, setEmpresa] = useState<Firma | null>(null);
  const [links, setLinks] = useState<LinkFirma[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [bajando, setBajando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const b = buscar.trim() || undefined;
      if (vista === "contratos") setContratos(await contratosApi.contratos({ buscar: b }));
      else if (vista === "links") setLinks(await contratosApi.links());
      else {
        const [lista, deEmpresa] = await Promise.all([contratosApi.firmas({ tipo: vista === "clientes" ? "CLIENTE" : vista === "cuentas" ? "COMISIONISTA" : "TITULAR", buscar: b }), contratosApi.firmas({ tipo: "EMPRESA" })]);
        setFirmas(lista);
        setEmpresa(deEmpresa[0] ?? null);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar.");
    }
  }, [vista, buscar]);
  useEffect(() => {
    const t = setTimeout(() => void cargar(), buscar ? 350 : 0);
    return () => clearTimeout(t);
  }, [cargar, buscar]);

  async function descargar(c: ContratoResumen) {
    setBajando(c.id);
    try {
      const k = await contratosApi.contrato(c.id);
      const d = k.datos as { comitente: Parte; comisionista: Parte; titular?: { nombre: string; cedula: string } | null; finiquito: Finiquito | null };
      await descargarContrato(
        {
          comitente: d.comitente,
          comisionista: d.comisionista,
          titular: d.titular ?? null,
          firmaComitente: await firmaParaWord(k.firmaCliente?.imagen ?? null),
          firmaComisionista: await firmaParaWord(k.firmaEmpresa?.imagen ?? null),
          firmaTitular: await firmaParaWord(k.firmaTitular?.imagen ?? null),
          finiquito: d.finiquito,
        },
        `Contrato ${k.cliente_nombre}${k.numero ? ` - ${k.numero}` : ""}.docx`
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo descargar el contrato.");
    } finally {
      setBajando(null);
    }
  }

  async function quitar(f: Firma) {
    if (!window.confirm(`¿Quitar la firma de ${f.nombre}? Los contratos ya hechos la conservan; los nuevos ya no la usan.`)) return;
    try {
      await contratosApi.quitarFirma(f.id);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo quitar la firma.");
    }
  }

  function copiar(token: string) {
    void navigator.clipboard?.writeText(urlDeFirma(token)).then(() => {
      setAviso("Link copiado.");
      setTimeout(() => setAviso(null), 2500);
    });
  }

  const marca = (si: boolean, que: string) => (
    <span className={`ct-marca ${si ? "si" : "no"}`} title={`${que}: ${si ? "firmó" : "sin firma"}`}>
      {si ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {que}
    </span>
  );

  return (
    <div className="ct-pagina">
      <Header />
      <header className="ct-cabeza">
        <FileSignature size={26} />
        <div>
          <h1>Contratos</h1>
          <p>Los contratos de comisión de los clientes y las firmas de los clientes y de los titulares de las cuentas. El contrato se hace desde la hoja del cliente.</p>
        </div>
      </header>
      <div className="ct-barra">
        <div className="ct-pestanas" role="tablist">
          {(
            [
              ["contratos", "Contratos"],
              ["clientes", "Firmas de clientes"],
              ["titulares", "Firmas de titulares"],
              ["cuentas", "Titulares de nuestras cuentas"],
              ["links", "Links para firmar"],
            ] as [Vista, string][]
          ).map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={vista === v} className={vista === v ? "activo" : ""} onClick={() => setVista(v)}>
              {t}
            </button>
          ))}
        </div>
        {vista !== "links" && (
          <label className="ct-buscar">
            <Search size={14} />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={vista === "contratos" ? "Cliente, titular o número" : "Nombre, cédula o cuenta"} aria-label="Buscar" />
          </label>
        )}
      </div>
      {error && <p className="cc-form-error ct-error">{error}</p>}
      {aviso && <p className="ct-aviso">{aviso}</p>}

      {vista === "contratos" && (
        <div className="ct-tabla">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>N°</th>
                <th>Cliente</th>
                <th>Titular de la cuenta</th>
                <th>Firmas</th>
                <th>Hecho por</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contratos === null && (
                <tr>
                  <td colSpan={7} className="ct-vacio">
                    Cargando…
                  </td>
                </tr>
              )}
              {contratos?.length === 0 && (
                <tr>
                  <td colSpan={7} className="ct-vacio">
                    Todavía no hay contratos. Se hacen desde la hoja del cliente: “Contrato y finiquito (Word)”.
                  </td>
                </tr>
              )}
              {contratos?.map((c) => (
                <tr key={c.id}>
                  <td>{fechaHora(c.created_at)}</td>
                  <td className="ct-num">{c.numero ?? "—"}</td>
                  <td>
                    <b>{c.cliente_nombre}</b>
                    {c.con_finiquito && <small>con finiquito</small>}
                  </td>
                  <td>
                    {c.titular_nombre ?? <span className="ct-tenue">el mismo cliente</span>}
                    {c.comisionista_nombre && <small>Comisionista: {c.comisionista_nombre}</small>}
                  </td>
                  <td className="ct-marcas">
                    {marca(c.firmo_cliente, "Cliente")}
                    {c.titular_nombre && marca(c.firmo_titular, "Titular")}
                    {marca(c.firmo_empresa, "Empresa")}
                  </td>
                  <td>{c.hecho_por ?? "—"}</td>
                  <td>
                    <button type="button" className="ct-boton" onClick={() => void descargar(c)} disabled={bajando === c.id}>
                      <Download size={13} /> {bajando === c.id ? "Armando…" : "Word"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(vista === "clientes" || vista === "titulares" || vista === "cuentas") && (
        <>
          {empresa && vista === "clientes" && (
            <div className="ct-empresa">
              <span>Firma de la empresa (va en todos los contratos):</span>
              <img src={empresa.imagen} alt="Firma de la empresa" />
              <b>{empresa.nombre}</b>
            </div>
          )}
          <div className="ct-firmas">
            {firmas === null && <p className="ct-vacio">Cargando…</p>}
            {firmas?.length === 0 && (
              <p className="ct-vacio">
                {vista === "cuentas"
                  ? "Ninguna cuenta de la empresa tiene todavía la firma de su titular. Se carga en Capital de giros → ⋯ de la cuenta → “Titular y firma (contratos)”."
                  : `${vista === "clientes" ? "Todavía no hay firmas de clientes." : "Todavía no hay firmas de titulares."} Se cargan desde el contrato del cliente (subir, dibujar o con el link).`}
              </p>
            )}
            {firmas?.map((f) => (
              <article key={f.id} className="ct-firma">
                <img src={f.imagen} alt={`Firma de ${f.nombre}`} />
                <b>{f.nombre}</b>
                <small>C.I. {f.cedula ?? "—"}</small>
                {f.tipo === "TITULAR" && (f.numero_cuenta || f.banco) && (
                  <small>
                    {f.banco ?? ""} {f.numero_cuenta ? `cta. ${f.numero_cuenta}` : ""}
                  </small>
                )}
                {f.tipo === "TITULAR" && f.cliente_nombre && <small>Cliente: {f.cliente_nombre}</small>}
                {f.tipo === "COMISIONISTA" && (
                  <>
                    <small>
                      <b>Titular de {f.caja_nombre ?? "una cuenta"}</b>
                    </small>
                    {(f.datos?.rif || f.datos?.ciudad) && (
                      <small>
                        {f.datos?.rif ? `RIF ${f.datos.rif}` : ""}
                        {f.datos?.ciudad ? ` · ${f.datos.ciudad}` : ""}
                      </small>
                    )}
                  </>
                )}
                <small className="ct-tenue">
                  {fecha(f.created_at)} · {f.origen === "LINK" ? "firmó por el link" : "cargada en el sistema"}
                </small>
                <button type="button" className="ct-quitar" onClick={() => void quitar(f)} title="Quitar esta firma">
                  <Trash2 size={13} />
                </button>
              </article>
            ))}
          </div>
        </>
      )}

      {vista === "links" && (
        <div className="ct-tabla">
          <table>
            <thead>
              <tr>
                <th>Creado</th>
                <th>Para</th>
                <th>Quién firma</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Vence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {links === null && (
                <tr>
                  <td colSpan={7} className="ct-vacio">
                    Cargando…
                  </td>
                </tr>
              )}
              {links?.length === 0 && (
                <tr>
                  <td colSpan={7} className="ct-vacio">
                    Todavía no se mandó ningún link.
                  </td>
                </tr>
              )}
              {links?.map((l) => (
                <tr key={l.id}>
                  <td>{fechaHora(l.created_at)}</td>
                  <td>{l.tipo === "CLIENTE" ? "Cliente" : l.tipo === "COMISIONISTA" ? `Titular de ${l.caja_nombre ?? "una cuenta"}` : "Titular"}</td>
                  <td>
                    <b>{l.nombre ?? "—"}</b>
                    {l.cedula && <small>C.I. {l.cedula}</small>}
                  </td>
                  <td>{l.cliente_nombre ?? "—"}</td>
                  <td>
                    <span className={`ct-estado ${l.estado.toLowerCase()}`}>{l.estado === "FIRMADO" ? `Firmado ${l.firmado_en ? fechaHora(l.firmado_en) : ""}` : l.estado === "VENCIDO" ? "Vencido" : "Pendiente"}</span>
                  </td>
                  <td>{fecha(l.expira_en)}</td>
                  <td>
                    {l.estado === "PENDIENTE" && (
                      <button type="button" className="ct-boton" onClick={() => copiar(l.token)}>
                        <Copy size={13} /> Copiar link
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
