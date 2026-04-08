import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMasters, fetchMyMaster, getAppointmentsByDateRange } from "../../api/api";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";

import AppointmentModal from "./AppointmentModal";
import "./Calendar.css";

function decodeToken(token) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

export default function Calendar({
  onRefresh,
  selectedMasters,
  selectedClients,
  selectedServices,
  dateRange,
  period,
  currentDate,
}) {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const token = useMemo(() => localStorage.getItem("token"), []);
  const tokenPayload = useMemo(() => decodeToken(token), [token]);
  const isAdmin = tokenPayload?.role === "admin";

  const [mastersMap, setMastersMap] = useState({});
  const calendarRef = useRef(null);

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

  useEffect(() => {
    if (!token) return;
    loadMasters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  const loadMasters = async () => {
    try {
      let masters = [];

      if (isAdmin) {
        masters = await fetchMasters(token);
      } else {
        const me = await fetchMyMaster(token);
        masters = me ? [me] : [];
      }

      const map = {};
      masters.forEach((master) => {
        map[master.id] = {
          name: master.name,
          color: master.color || "#3b82f6",
        };
      });
      setMastersMap(map);
    } catch (err) {
      console.error("Failed to load masters:", err);
      setMastersMap({});
    }
  };

  useEffect(() => {
    if (!token) return;
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, dateRange, selectedMasters, selectedClients, selectedServices, mastersMap]);

  useEffect(() => {
    if (!calendarRef.current) return;
    const calendarApi = calendarRef.current.getApi();
    calendarApi.changeView(getCalendarView());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    if (!calendarRef.current || !currentDate) return;
    const calendarApi = calendarRef.current.getApi();
    calendarApi.gotoDate(currentDate);
  }, [currentDate]);

  const hexToRgba = (hex, alpha = 0.3) => {
    const cleanHex = String(hex || "#000000").replace("#", "");

    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const loadAppointments = async () => {
    try {
      if (!dateRange || !token) return;

      const appointments = await getAppointmentsByDateRange(token, dateRange.start, dateRange.end);

      if (!Array.isArray(appointments)) {
        setEvents([]);
        return;
      }

      // ✅ FIX: allow client_id = null (Day Off) to pass client filter
      const filtered = appointments.filter((apt) => {
        const masterMatch = selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);

        const clientMatch =
          !apt.client_id || selectedClients.length === 0 || selectedClients.includes(apt.client_id);

        const serviceMatch = selectedServices.length === 0 || selectedServices.includes(apt.service_id);

        return masterMatch && clientMatch && serviceMatch;
      });

      const calendarEvents = filtered.map((apt) => {
        const masterColor = mastersMap[apt.master_id]?.color || "#3b82f6";
        const semitransparentColor = hexToRgba(masterColor, 0.25);

        const titleClientPart = apt.client_name ? ` (${apt.client_name})` : "";
        const titleServicePart = apt.service_name || "Service";

        return {
          id: apt.id,
          title: `${apt.master_name} - ${titleServicePart}${titleClientPart}`,
          start: apt.start_time,
          end: apt.end_time,
          backgroundColor: semitransparentColor,
          borderColor: masterColor,
          textColor: "#1f2937",
          extendedProps: {
            masterName: apt.master_name,
            clientName: apt.client_name || null,
            serviceName: apt.service_name,
            servicePrice: apt.service_price,
            status: apt.status,
            originalData: apt,
            masterColor,
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
          eventDisplay="block"
          dayMaxEventRows={10}
        />
      </div>

      {selectedEvent && (
        <AppointmentModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onUpdate={loadAppointments} />
      )}
    </div>
  );
}