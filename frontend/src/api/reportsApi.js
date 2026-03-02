const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const getSummaryAll = async (token, from, to) => {
  const response = await fetch(
    `${API_BASE}/reports/summary-all?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error("Failed to load report");
  return response.json();
};

// AI summary
export const getAISummary = async (token, from, to) => {
  const response = await fetch(`${API_BASE}/reports/ai-summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ from, to }),
  });
  if (!response.ok) throw new Error("Failed to generate AI summary");
  return response.json();
};

export const getRevenueByMaster = async (token, from, to) => {
  const response = await fetch(
    `${API_BASE}/reports/revenue-by-master?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error("Failed to load revenue by master");
  return response.json();
};

export const getRevenueByService = async (token, from, to) => {
  const response = await fetch(
    `${API_BASE}/reports/revenue-by-service?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error("Failed to load revenue by service");
  return response.json();
};

export const getRevenueByDay = async (token, from, to) => {
  const response = await fetch(
    `${API_BASE}/reports/revenue-by-day?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error("Failed to load revenue by day");
  return response.json();
};

export const getCancelledStats = async (token, from, to) => {
  const response = await fetch(
    `${API_BASE}/reports/cancelled?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error("Failed to load cancelled stats");
  return response.json();
};

export const getAverageCheck = async (token, from, to) => {
  const response = await fetch(
    `${API_BASE}/reports/average-check?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error("Failed to load average check");
  return response.json();
};

export const getAdminAssistantResponse = async (token, question, from, to) => {
  const response = await fetch(`${API_BASE}/reports/admin-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, from, to }),
  });
  if (!response.ok) throw new Error("Failed to get AI response");
  return response.json();
};

export const getScheduleInsights = async (token, from, to) => {
  const response = await fetch(`${API_BASE}/reports/schedule-insights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ from, to }),
  });
  if (!response.ok) throw new Error("Failed to generate schedule insights");
  return response.json();
};

export const getCogsReport = async (token, from, to, groupBy = "date") => {
  const response = await fetch(
    `${API_BASE}/reports/cogs-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&groupBy=${encodeURIComponent(groupBy)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error("Failed to load COGS report");
  return response.json();
};

export const getCogsSummary = async (token, from, to) => {
  const response = await fetch(
    `${API_BASE}/reports/cogs-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error("Failed to load COGS summary");
  return response.json();
};

export const exportToCSV = (data, filename, headers) => {
  if (!data || data.length === 0) {
    alert("No data to export");
    return;
  }

  const csvContent = [
    headers.join(","),
    ...data.map((row) => headers.map((header) => `"${row[header] || ""}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};