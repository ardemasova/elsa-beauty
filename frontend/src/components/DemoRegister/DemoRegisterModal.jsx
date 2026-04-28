import React, { useState } from 'react';
import './DemoRegisterModal.css';

export function DemoRegisterModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    phone: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('https://api.elsaerp.com/api/demo-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: '✅ ' + data.message
        });
        setFormData({ email: '', name: '', phone: '' });
        setTimeout(() => {
          setIsOpen(false);
          setMessage(null);
        }, 2500);
      } else {
        setMessage({
          type: 'error',
          text: '❌ ' + data.message
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: '❌ Network error. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = () => setIsOpen(true);
  const closeModal = () => {
    setIsOpen(false);
    setMessage(null);
  };

  return (
    <>
      {/* Кнопка */}
      <button 
        onClick={openModal}
        className="demo-btn"
      >
        Get Free Demo
      </button>

      {/* Модаль */}
      {isOpen && (
        <div className="demo-modal-overlay" onClick={closeModal}>
          <div className="demo-modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Закрыть */}
            <button 
              className="demo-modal-close"
              onClick={closeModal}
            >
              ✕
            </button>

            {/* Заголовок */}
            <div className="demo-modal-header">
              <h2>🎉 Get Free Demo Access</h2>
              <p>2 weeks free • Full access • No credit card required</p>
            </div>

            {/* Форма */}
            <form onSubmit={handleSubmit} className="demo-form">
              {/* Email */}
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Имя */}
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Телефон */}
              <div className="form-group">
                <label>Phone (optional)</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+1 (555) 000-0000"
                  disabled={isLoading}
                />
              </div>

              {/* Сообщение */}
              {message && (
                <div className={`form-message ${message.type}`}>
                  {message.text}
                </div>
              )}

              {/* Кнопка отправки */}
              <button 
                type="submit" 
                className="demo-submit-btn"
                disabled={isLoading}
              >
                {isLoading ? '⏳ Registering...' : 'Get Demo Access'}
              </button>

              <p className="demo-form-note">
                📧 We'll send your login credentials to your email
              </p>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
