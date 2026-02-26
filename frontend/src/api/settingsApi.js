const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const getCompanySettings = async (token) => {
  const response = await fetch(`${API_BASE}/settings/company`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load company settings');
  const data = await response.json();
  
  // Преобразуем данные из API в формат формы
  return {
    company_name: data.name || "",
    company_address: data.address || "",
    company_vat_number: data.vat_number || "",
    company_bank_name: data.bank_name || "",
    company_bank_account: data.bank_account || "",
    company_bank_code: data.bank_code || "",
    company_email: data.email || "",
    company_phone: data.phone || "",
    company_website: data.website || "",
  };
};

export const updateCompanySettings = async (token, formData) => {
  // Преобразуем данные из формы в формат API
  const payload = {
    name: formData.company_name,
    address: formData.company_address,
    vat_number: formData.company_vat_number,
    bank_name: formData.company_bank_name,
    bank_account: formData.company_bank_account,
    bank_code: formData.company_bank_code,
    email: formData.company_email,
    phone: formData.company_phone,
    website: formData.company_website,
  };

  const response = await fetch(`${API_BASE}/settings/company`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error('Failed to update company settings');
  return response.json();
};