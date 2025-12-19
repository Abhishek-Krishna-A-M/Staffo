import React, { useEffect, useState } from "react";
import { MapPin, ClockAfternoon, CircleNotch } from "@phosphor-icons/react";
import { supabase } from "../utils/supabase";

/* reuse period times (same mapping used elsewhere) */
function getPeriodTimeMap(dayKey) {
  const monThu = [
    { period: 1, start: "09:00:00", end: "09:50:00" },
    { period: 2, start: "09:50:00", end: "10:40:00" },
    { period: 3, start: "10:50:00", end: "11:40:00" },
    { period: 4, start: "11:40:00", end: "12:30:00" },
    { period: 5, start: "13:20:00", end: "14:10:00" },
    { period: 6, start: "14:20:00", end: "15:10:00" },
    { period: 7, start: "15:10:00", end: "16:00:00" },
  ];
  const fri = [
    { period: 1, start: "09:00:00", end: "09:50:00" },
    { period: 2, start: "09:50:00", end: "10:40:00" },
    { period: 3, start: "10:50:00", end: "11:40:00" },
    { period: 4, start: "11:40:00", end: "12:30:00" },
    { period: 5, start: "13:50:00", end: "14:30:00" },
    { period: 6, start: "14:40:00", end: "15:20:00" },
    { period: 7, start: "15:20:00", end: "16:00:00" },
  ];
  if (!dayKey) return monThu;
  if (dayKey === "friday") return fri;
  return monThu;
}

const STATUS_META = {
  available: { label: "Available", bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
  in_class: { label: "In Class", bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
  busy: { label: "Busy", bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500" },
  on_leave: { label: "On Leave", bg: "bg-gray-100", text: "text-gray-800", dot: "bg-gray-500" },
  in_meeting: { label: "In Meeting", bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
};

function getDayKeyFromDateObj(d) {
  const idx = d.getDay();
  if (idx === 0) return null;
  const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[idx].toLowerCase();
}

function toISODateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseDateTimeLocal(dateIso, timeStr) {
  return new Date(`${dateIso}T${timeStr}`);
}

function formatTo12(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return "";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  let hh = parseInt(parts[0], 10);
  const mm = (parts[1] || "00").padStart(2, "0");
  if (Number.isNaN(hh)) return timeStr;
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${mm} ${ampm}`;
}

export default function StaffPopup({ staff, onClose = () => { }, onViewMap = () => { } }) {
  const [todayClasses, setTodayClasses] = useState([]);
  const [todayMeetings, setTodayMeetings] = useState([]);
  const [superStatuses, setSuperStatuses] = useState([]);
  const [currentMeeting, setCurrentMeeting] = useState(null);
  const [loading, setLoading] = useState(true);

  if (!staff) return null;

  const todayDateIso = toISODateOnly(new Date());
  const dayKey = getDayKeyFromDateObj(new Date());

  useEffect(() => {
    if (!staff?.id) return;

    const loadAllData = async () => {
      setLoading(true);
      // Run all fetches in parallel to reduce wait time
      await Promise.all([
        loadTimetableDynamic(),
        loadMeetingsDynamic(),
        loadSuperStatuses()
      ]);
      setLoading(false);
    };

    loadAllData();
  }, [staff?.id, todayDateIso]);

  const loadSuperStatuses = async () => {
    const { data, error } = await supabase
      .from("super_statuses")
      .select("*")
      .eq("staff_id", staff.id)
      .eq("status_date", todayDateIso)
      .order("start_time", { ascending: true });

    if (!error && data) {
      const normalized = data.map(s => ({
        ...s,
        start_display: formatTo12(s.start_time),
        end_display: formatTo12(s.end_time)
      }));
      setSuperStatuses(normalized);
    }
  };

  const loadTimetableDynamic = async () => {
    const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
    try {
      const { data: perDayRows, error: perDayErr } = await supabase
        .from("timetable")
        .select("start_time, end_time, place")
        .eq("staff_id", staff.id)
        .eq("day", todayName)
        .order("start_time", { ascending: true });

      if (!perDayErr && Array.isArray(perDayRows) && perDayRows.length > 0) {
        const normalized = perDayRows.map((r) => {
          const rawStart = r.start_time ? (r.start_time.length >= 5 ? r.start_time.slice(0, 8) : r.start_time) : "";
          const rawEnd = r.end_time ? (r.end_time.length >= 5 ? r.end_time.slice(0, 8) : r.end_time) : "";
          return {
            place: r.place || "—",
            start_display: formatTo12(rawStart),
            end_display: formatTo12(rawEnd),
            start_raw: rawStart,
            end_raw: rawEnd,
            source: "timetable_row",
          };
        });
        setTodayClasses(normalized);
        return;
      }

      const { data: arrayRow, error: arrayErr } = await supabase
        .from("timetable")
        .select("staff_id, monday, tuesday, wednesday, thursday, friday, saturday")
        .eq("staff_id", staff.id)
        .maybeSingle();

      if (arrayErr || !arrayRow) {
        setTodayClasses([]);
        return;
      }

      const dayArr = (dayKey && arrayRow[dayKey]) || [];
      const periodTimes = getPeriodTimeMap(dayKey);
      const classes = [];
      for (let i = 0; i < Math.min(7, dayArr.length); i++) {
        const place = dayArr[i];
        if (typeof place === "string" && place.trim() !== "") {
          const pt = periodTimes[i] || { start: "", end: "" };
          classes.push({
            place: place,
            start_display: pt.start ? formatTo12(pt.start) : "",
            end_display: pt.end ? formatTo12(pt.end) : "",
            start_raw: pt.start,
            end_raw: pt.end,
            source: "timetable_array",
            period: i + 1,
          });
        }
      }
      setTodayClasses(classes);
    } catch (err) {
      setTodayClasses([]);
    }
  };

  const loadMeetingsDynamic = async () => {
    try {
      const hostQ = supabase.from("meetings").select("*").eq("host_staff_id", staff.id).eq("meeting_date", todayDateIso);
      const partQ = supabase.from("meeting_participants").select(`meeting_id, meetings (*)`).eq("staff_id", staff.id);

      const [hostRes, partRes] = await Promise.all([hostQ, partQ]);
      let meetings = (hostRes.data || []);
      if (partRes.data) {
        const fromParts = partRes.data.map((r) => r.meetings).filter((m) => m && m.meeting_date === todayDateIso);
        meetings = meetings.concat(fromParts);
      }

      const seen = new Set();
      const deduped = meetings.filter((m) => {
        if (!m?.id || seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      deduped.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
      const normalized = deduped.map((m) => ({
        ...m,
        start_time_raw: m.start_time,
        end_time_raw: m.end_time,
        start_time: formatTo12(m.start_time),
        end_time: formatTo12(m.end_time),
      }));

      setTodayMeetings(normalized);
      const now = new Date();
      const current = normalized.find((m) => {
        const s = parseDateTimeLocal(todayDateIso, m.start_time_raw);
        const e = parseDateTimeLocal(todayDateIso, m.end_time_raw);
        return s <= now && now < e;
      }) || null;
      setCurrentMeeting(current);
    } catch (err) {
      setTodayMeetings([]);
    }
  };

  const meta = STATUS_META[staff.status] || STATUS_META.available;

  return (
    <div className="fixed inset-0 z-1000 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="relative w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl p-6 shadow-lg overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 p-2 text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
        <div className="flex justify-center -mt-3 mb-5">
          <div className="w-24 h-1.5 bg-gray-200 rounded-full" />
        </div>

        <div className="flex flex-col items-center text-center">
          <img src={staff.photo_url || "/profile-icon.png"} alt={staff.name} className="w-28 h-28 rounded-full object-cover shadow-sm" />
          <h2 className="mt-4 text-xl font-semibold">{staff.name}</h2>
          <p className="text-sm text-gray-500">{staff.designation ? staff.designation + " - " : ""}{staff.dept}</p>
          <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${meta.bg}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
            <span className={`text-sm font-medium ${meta.text}`}>{meta.label}</span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="p-2 rounded-full bg-gray-100"><MapPin size={18} className="text-black" /></div>
          <div className="text-sm text-gray-800 font-medium">{staff.location || "No location set"}</div>
        </div>

        <hr className="my-6 border-gray-100" />

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10">
            <CircleNotch size={32} className="animate-spin text-gray-400" />
            <p className="text-sm text-gray-500 mt-2">Checking schedule...</p>
          </div>
        ) : (
          <>
            {/* Super Status Section */}
            {superStatuses.length > 0 && (
              <div className="mt-6">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <ClockAfternoon size={20} className="text-yellow-600" /> Special Schedule
                </h3>
                <div className="mt-2 space-y-2">
                  {superStatuses.map((s) => (
                    <div key={s.id} className="p-3 border border-yellow-200 rounded-xl bg-yellow-50/50 text-sm flex flex-col">
                      <span className="font-bold text-gray-800">{s.description}</span>
                      <span className="text-gray-600 text-xs font-medium uppercase mt-0.5">{s.start_display} - {s.end_display}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentMeeting && (
              <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
                <h3 className="font-semibold text-black-800">Ongoing Meeting</h3>
                <p className="text-sm text-black-700 mt-1">{currentMeeting.title}</p>
                <p className="text-xs text-black-600">{currentMeeting.start_time} - {currentMeeting.end_time}</p>
                <p className="text-xs text-black-600 flex flex-row gap-1"><MapPin size={15} />{currentMeeting.location}</p>
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-base font-semibold">Today's Meetings</h3>
              <div className="mt-2 space-y-2">
                {todayMeetings.length === 0 && <p className="text-gray-500 text-sm">No meetings today</p>}
                {todayMeetings.map((m) => (
                  <div key={m.id} className="p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm flex flex-col">
                    <span className="font-medium">{m.title}</span>
                    <span className="text-gray-500">{m.start_time} - {m.end_time}</span>
                    <span className="text-gray-500 flex flex-row gap-1"><MapPin size={15} className="mt-0.5" /> {m.location}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pb-5">
              <h3 className="text-base font-semibold">Today's Timetable</h3>
              {todayClasses.length === 0 ? (
                <p className="text-sm text-gray-500 mt-2">No classes today</p>
              ) : (
                <div className="mt-3 space-y-3 relative pl-3">
                  <div className="absolute left-1 top-2 bottom-2 w-0.5 bg-gray-200" />
                  {todayClasses.map((cls, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="relative" style={{ marginLeft: "-14px" }}>
                        <div className="w-3.5 h-3.5 rounded-full bg-black border-2 border-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-800">{cls.place}</div>
                        <div className="text-sm text-gray-500">{cls.start_display} – {cls.end_display}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
