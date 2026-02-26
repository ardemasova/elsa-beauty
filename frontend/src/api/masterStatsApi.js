const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const getMasterPerformance = async (token, filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.masterId) params.append('masterId', filters.masterId);

  const response = await fetch(`${API_BASE}/reports/master-performance?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Failed to load master performance');
  return response.json();
};

export const getMasters = async (token) => {
  const response = await fetch(`${API_BASE}/masters`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Failed to load masters');
  return response.json();
};

export const exportToExcel = (data, filename = 'master-performance.xlsx') => {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Создаём CSV из данных
  const headers = [
    'Master Name',
    'Revenue Generated',
    'Commission',
    'Gross Margin',
    'Net Margin',
    'Appointments Completed',
    'Appointments Cancelled',
    'Appointments Planned',
    'Hours Worked',
    'Revenue Per Hour',
    'Margin %',
    'Net Margin %',
  ];

  const rows = data.map(master => [
    master.master_name,
    master.revenue_generated,
    master.commission,
    master.gross_margin,
    master.net_margin,
    master.appointments_completed,
    master.appointments_cancelled,
    master.appointments_planned,
    master.hours_worked,
    master.revenue_per_hour,
    master.margin_percent,
    master.net_margin_percent,
  ]);

  // Конвертим в CSV
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  // Скачиваем файл
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};