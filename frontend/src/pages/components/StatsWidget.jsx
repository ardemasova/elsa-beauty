export default function StatsWidget({ title, value, subtitle, trend, icon }) {
  return (
    <div className="stats-widget">
      <div className="stats-header">
        <img src={icon} alt={title} className="stats-icon" />
        {trend && <span className="stats-trend">{trend}</span>}
      </div>
      <p className="stats-title">{title}</p>
      <p className="stats-value">{value}</p>
      <p className="stats-subtitle">{subtitle}</p>
    </div>
  );
}