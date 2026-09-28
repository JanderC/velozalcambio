export function AbrirTurnoForm({ onAbrir }: { onAbrir: () => void }) {
  return (
    <div>
      <p className="cierre-panel-vacio">No hay un turno abierto para esta caja y moneda.</p>
      <button className="cierre-btn-abrir" onClick={onAbrir}>Abrir turno</button>
    </div>
  );
}