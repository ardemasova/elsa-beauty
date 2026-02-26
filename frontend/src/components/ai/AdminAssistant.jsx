import { useState, useRef, useEffect } from "react";
import { getAdminAssistantResponse } from "../../api/reportsApi";
import "./AdminAssistant.css";

export default function AdminAssistant({ token }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: "bot",
      text: "Hello! I'm your AI Assistant. Ask me questions about your business metrics and I'll analyze the data for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: getDefaultFromDate(),
    to: getDefaultToDate(),
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const messagesEndRef = useRef(null);

  function getDefaultFromDate() {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split("T")[0];
  }

  function getDefaultToDate() {
    const date = new Date();
    return date.toISOString().split("T")[0];
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage = {
      id: messages.length + 1,
      type: "user",
      text: input,
    };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Get AI response
      const response = await getAdminAssistantResponse(
        token,
        input,
        dateRange.from,
        dateRange.to
      );

      const botMessage = {
        id: messages.length + 2,
        type: "bot",
        text: response.answer,
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error("Failed to get response:", err);
      const errorMessage = {
        id: messages.length + 2,
        type: "bot",
        text: "Sorry, I encountered an error. Please try again.",
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const exampleQuestions = [
    "Who is the most profitable master this month?",
    "Where are the most cancellations?",
    "What's the average check amount?",
    "Which service generates the most revenue?",
  ];

  const handleExampleQuestion = (question) => {
    setInput(question);
  };

  return (
    <div className="admin-assistant">
      {/* Date Range Selector */}
      <div className="date-selector">
        <button
          className="date-toggle"
          onClick={() => setShowDatePicker(!showDatePicker)}
        >
          📅 {dateRange.from} → {dateRange.to}
        </button>

        {showDatePicker && (
          <div className="date-picker-panel">
            <div className="date-field">
              <label>From Date</label>
              <input
                type="date"
                name="from"
                value={dateRange.from}
                onChange={handleDateChange}
                className="date-input"
              />
            </div>
            <div className="date-field">
              <label>To Date</label>
              <input
                type="date"
                name="to"
                value={dateRange.to}
                onChange={handleDateChange}
                className="date-input"
              />
            </div>
            <button
              className="btn-close"
              onClick={() => setShowDatePicker(false)}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div className="chat-container">
        <div className="messages-area">
          {messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.type}`}>
              <div className={`message-content ${msg.isError ? "error" : ""}`}>
                <p>{msg.text}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="message message-bot">
              <div className="message-content loading">
                <span className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Example Questions (show when no messages or at start) */}
        {messages.length <= 1 && !loading && (
          <div className="example-questions">
            <p className="example-title">Try asking:</p>
            <div className="examples-grid">
              {exampleQuestions.map((question, idx) => (
                <button
                  key={idx}
                  className="example-btn"
                  onClick={() => handleExampleQuestion(question)}
                >
                  <span className="example-icon">✨</span>
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form className="input-area" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="message-input"
          placeholder="Ask me about your business metrics..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-send"
          disabled={loading || !input.trim()}
        >
          {loading ? "⏳" : "📤"}
        </button>
      </form>
    </div>
  );
}