const API_BASE = import.meta.env.VITE_API_URL || "/api";

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
