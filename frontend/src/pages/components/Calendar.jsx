import { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import { getAppointmentsByDateRange, fetchMasters } from "../../api/api";
import AppointmentModal from "./AppointmentModal";
import "./Calendar.css";

export default function Calendar({ 
  onRefresh, 
  selectedMasters, 
  selectedClients, 
  selectedServices, 
  dateRange,
  period,
  currentDate
}) {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [token] = useState(localStorage.getItem("token"));
  const [mastersMap, setMastersMap] = useState({});
  const calendarRef = useRef(null);

  // Маппинг периода на FullCalendar view
  const getCalendarView = () => {
    switch (period) {
      case "day":
        return "timeGridDay";
      case "week":
        return "timeGridWeek";
      case "month":
        return "dayGridMonth";
      default:
        return "timeGridWeek";
    }
  };

  // Загружаем мастеров один раз
  useEffect(() => {
    if (token) {
      loadMasters();
    }
  }, [token]);

  const loadMasters = async () => {
    try {
      const masters = await fetchMasters(token);
      // Создаём map мастеров по ID
      const map = {};
      masters.forEach(master => {
        map[master.id] = {
          name: master.name,
          color: master.color || "#3b82f6",
        };
      });
      setMastersMap(map);
    } catch (err) {
      console.error("Failed to load masters:", err);
    }
  };

  // Загрузка данных ��огда токен готов
  useEffect(() => {
    if (token) {
      loadAppointments();
    }
  }, [token, dateRange, selectedMasters, selectedClients, selectedServices]);

  // Обновить вид календаря при смене периода
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      const newView = getCalendarView();
      calendarApi.changeView(newView);
    }
  }, [period]);

  // Перейти на нужную дату
  useEffect(() => {
    if (calendarRef.current && currentDate) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(currentDate);
    }
  }, [currentDate]);

  // Функция для преобразования hex в rgba (полупрозрачный)
  const hexToRgba = (hex, alpha = 0.3) => {
    // Удаляем # если есть
    const cleanHex = hex.replace('#', '');
    
    // Преобразуем в RGB
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const loadAppointments = async () => {
    try {
      if (!dateRange || !token) return;

      const appointments = await getAppointmentsByDateRange(
        token,
        dateRange.start,
        dateRange.end
      );

      if (!Array.isArray(appointments)) {
        setEvents([]);
        return;
      }

      // Фильтруем по выбранным фильтрам
      const filtered = appointments.filter(apt => {
        const masterMatch = selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);
        const clientMatch = selectedClients.length === 0 || selectedClients.includes(apt.client_id);
        const serviceMatch = selectedServices.length === 0 || selectedServices.includes(apt.service_id);
        return masterMatch && clientMatch && serviceMatch;
      });

      // Преобразуем в FullCalendar формат
      const calendarEvents = filtered.map((apt) => {
        // Получаем цвет мастера из map
        const masterColor = mastersMap[apt.master_id]?.color || "#3b82f6";
        const semitransparentColor = hexToRgba(masterColor, 0.25);
        const borderColor = masterColor;

        return {
          id: apt.id,
          title: `${apt.master_name} - ${apt.service_name}`,
          start: apt.start_time,
          end: apt.end_time,
          backgroundColor: semitransparentColor,
          borderColor: borderColor,
          textColor: "#1f2937",
          extendedProps: {
            masterName: apt.master_name,
            clientName: apt.client_name,
            serviceName: apt.service_name,
            servicePrice: apt.service_price,
            status: apt.status,
            originalData: apt,
            masterColor: masterColor,
          },
        };
      });

      setEvents(calendarEvents);
    } catch (err) {
      console.error("Failed to load appointments:", err);
      setEvents([]);
    }
  };

  const handleEventClick = (info) => {
    setSelectedEvent(info.event);
  };

  return (
    <div className="calendar-wrapper">
      <div className="calendar-container">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView={getCalendarView()}
          headerToolbar={false}
          events={events}
          eventClick={handleEventClick}
          height="auto"
          slotLabelInterval="01:00"
          slotLabelFormat={{
            hour: "numeric",
            meridiem: "short",
            omitZeroMinute: true,
          }}
          contentHeight="auto"
          slotMinTime="08:00"
          slotMaxTime="18:00"
          expandRows={false}
          dayMaxEvents={false}
          allDaySlot={false}
          eventDisplay="block"  // Показываем события как блоки, а не точки
          dayMaxEventRows={10}
        />
      </div>

      {/* Модаль */}
      {selectedEvent && (
        <AppointmentModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdate={loadAppointments}
        />
      )}
    </div>
  );
}