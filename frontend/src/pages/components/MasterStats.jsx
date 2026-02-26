export default function MasterStats({ data }) {
  if (!data || data.length === 0) {
    return <p style={{ textAlign: "center", color: "#9ca3af" }}>No master data available</p>;
  }

  const sorted = [...data].sort((a, b) => b.total_revenue - a.total_revenue);

  return (
    <div className="master-stats-grid">
      {sorted.map((master) => (
        <div key={master.id} className="master-stat-card">
          <div className="card-header">
            <div className="card-title-section">
              <div
                className="master-color-indicator"
                style={{ backgroundColor: master.color || "#999" }}
              ></div>
              <h3 className="card-title">{master.name}</h3>
            </div>
          </div>

          <div className="card-stats">
            <div className="card-stat">
              <span className="card-stat-label">Revenue</span>
              <span className="card-stat-value">${parseFloat(master.total_revenue).toFixed(0)}</span>
            </div>
            <div className="card-stat">
              <span className="card-stat-label">Appointments</span>
              <span className="card-stat-value">{master.total_appointments}</span>
            </div>
            <div className="card-stat">
              <span className="card-stat-label">Avg Check</span>
              <span className="card-stat-value">${parseFloat(master.avg_check).toFixed(0)}</span>
            </div>
            <div className="card-stat">
              <span className="card-stat-label">Clients</span>
              <span className="card-stat-value">{master.unique_clients}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}