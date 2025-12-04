// AvailabilityAdvanced.jsx
import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { supabase } from "../utils/supabase";

/* weekday-aware period times */
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

const FILTERS = ["All", "OFFICE", "BSH", "CSE", "CY", "AD", "EEE", "ME", "CE", "ECE", "MR", "RA"];

function getDayKeyFromDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const idx = d.getDay();
  if (idx === 0) return null;
  const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[idx].toLowerCase();
}

function parseTimeOnDate(dateIso, timeStr) {
  return new Date(`${dateIso}T${timeStr}`);
}

function meetingOverlapsPeriod(meeting, dateIso, periodTime) {
  const mStart = parseTimeOnDate(dateIso, meeting.start_time);
  const mEnd = parseTimeOnDate(dateIso, meeting.end_time);
  const pStart = parseTimeOnDate(dateIso, periodTime.start);
  const pEnd = parseTimeOnDate(dateIso, periodTime.end);
  return mStart < pEnd && mEnd > pStart;
}

function busyPeriodsFromTimetableRow(timetableRow, dayKey) {
  const set = new Set();
  if (!timetableRow || !dayKey) return set;
  const arr = timetableRow[dayKey];
  if (!Array.isArray(arr)) return set;
  for (let i = 0; i < Math.min(arr.length, 7); i++) {
    if (typeof arr[i] === "string" && arr[i].trim() !== "") set.add(i + 1);
  }
  return set;
}

export default function AvailabilityAdvanced() {
  const [staff, setStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);

  const [timetableMap, setTimetableMap] = useState({});
  const [meetingsByStaff, setMeetingsByStaff] = useState({});
  const [perStaffBusy, setPerStaffBusy] = useState({});
  const [availableCount, setAvailableCount] = useState({});
  const [perPeriodDetails, setPerPeriodDetails] = useState({});
  const [bestPeriods, setBestPeriods] = useState({ exactCommon: [], fallbackBest: [] });

  const [hideHeatMap, setHideHeatMap] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingStaff(true);
      const res = await supabase.from("staff").select("id, name, dept, designation, location, photo_url").order("name", { ascending: true });
      if (!mounted) return;
      if (res.error) {
        console.error("Failed to load staff", res.error);
        setStaff([]);
      } else setStaff(res.data || []);
      setLoadingStaff(false);
    };
    load();
    return () => (mounted = false);
  }, []);

  const toggleStaffSelection = (id) => {
    setSelectedStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Helper to render combined class + meeting details
  const renderBusyDetails = (details) => {
    // details may be:
    // { reason: "class", meta: "Room101" }
    // { reason: "meeting", meta: { title, start_time, end_time, location } }
    // or merged where meta is an array mixing strings and meeting objects.
    if (!details) return null;

    // If meta is an array, show each item in order (prefer class string first if present)
    if (Array.isArray(details.meta)) {
      return (
        <div className="space-y-1">
          {details.meta.map((item, idx) => {
            if (typeof item === "string") {
              // class string
              return (
                <div key={idx} className="text-xs text-gray-700">
                  <strong>Class</strong> — {item}
                </div>
              );
            } else if (item && typeof item === "object" && item.type === "meeting") {
              return (
                <div key={idx} className="text-xs text-gray-700">
                  <strong>Meeting</strong> — {item.title} ({item.start_time.slice(0,5)} - {item.end_time.slice(0,5)}) @ {item.location || "—"}
                </div>
              );
            } else if (item && typeof item === "object") {
              // fallback meeting object without type
              return (
                <div key={idx} className="text-xs text-gray-700">
                  <strong>Meeting</strong> — {item.title || "Untitled"} ({(item.start_time || "").slice(0,5)} - {(item.end_time || "").slice(0,5)}) @ {item.location || "—"}
                </div>
              );
            } else {
              return null;
            }
          })}
        </div>
      );
    }

    // If meta is a plain string -> class
    if (typeof details.meta === "string") {
      return (
        <div className="text-xs text-gray-700">
          <strong>Class</strong> — {details.meta}
        </div>
      );
    }

    // If meta is an object -> meeting
    if (details.meta && typeof details.meta === "object") {
      const m = details.meta;
      return (
        <div className="text-xs text-gray-700">
          <strong>Meeting</strong> — {m.title || "Untitled"} ({(m.start_time || "").slice(0,5)} - {(m.end_time || "").slice(0,5)}) @ {m.location || "—"}
        </div>
      );
    }

    // fallback
    return <div className="text-xs text-gray-700">Busy</div>;
  };

  const analyze = async () => {
    if (selectedStaffIds.length === 0) {
      setTimetableMap({}); setMeetingsByStaff({}); setPerStaffBusy({}); setAvailableCount({}); setPerPeriodDetails({}); setBestPeriods({ exactCommon: [], fallbackBest: [] });
      return;
    }

    setAnalyzing(true);
    const dayKey = getDayKeyFromDate(selectedDate);
    const PERIOD_TIME_MAP = getPeriodTimeMap(dayKey);

    // 1) timetables
    const ttRes = await supabase
      .from("timetable")
      .select("staff_id, monday, tuesday, wednesday, thursday, friday, saturday")
      .in("staff_id", selectedStaffIds);
    if (ttRes.error) console.error("Timetable fetch error:", ttRes.error);
    const ttMap = {};
    (ttRes.data || []).forEach((r) => (ttMap[r.staff_id] = r));
    setTimetableMap(ttMap);

    // 2) meeting participants (meeting_participants has meeting_id + staff_id)
    const mpRes = await supabase
      .from("meeting_participants")
      .select("meeting_id, staff_id")
      .in("staff_id", selectedStaffIds);
    if (mpRes.error) console.error("Meeting participants fetch error:", mpRes.error);

    // collect meeting ids where selected staff are participants
    const meetingIdsFromParticipants = new Set((mpRes.data || []).map((r) => r.meeting_id));

    // 3) fetch meetings where host in selected OR id in participant meeting ids (filter BY selectedDate for BOTH queries)
    const meetingIdArray = Array.from(meetingIdsFromParticipants);
    let meetings = [];
    try {
      // meetings where selected are hosts (and on selectedDate)
      const qHost = supabase
        .from("meetings")
        .select("id, host_staff_id, title, description, meeting_date, start_time, end_time, location")
        .eq("meeting_date", selectedDate)
        .in("host_staff_id", selectedStaffIds);

      const queries = [qHost];

      // meetings where selected are participants (only ids we collected) — also filter by meeting_date
      if (meetingIdArray.length) {
        const qPart = supabase
          .from("meetings")
          .select("id, host_staff_id, title, description, meeting_date, start_time, end_time, location")
          .in("id", meetingIdArray)
          .eq("meeting_date", selectedDate); // ensure participant meetings are for the selected date
        queries.push(qPart);
      }

      const results = await Promise.all(queries);
      const arrs = results.flatMap((r) => (r && r.data ? r.data : []));
      const seen = new Set();
      meetings = arrs.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    } catch (err) {
      console.error("Meetings fetch error:", err);
    }

    // 4) build meetingsMap per staff (host OR participant)
    const meetingsMap = {};
    selectedStaffIds.forEach((id) => (meetingsMap[id] = []));
    // attach host meetings
    meetings.forEach((m) => {
      if (selectedStaffIds.includes(m.host_staff_id)) meetingsMap[m.host_staff_id].push(m);
    });
    // attach participant meetings using mpRes rows (mpRes.data contains meeting_id + staff_id)
    (mpRes.data || []).forEach((mp) => {
      const sid = mp.staff_id; // correct column name
      if (!meetingsMap[sid]) meetingsMap[sid] = [];
      const meeting = meetings.find((x) => x.id === mp.meeting_id);
      if (meeting) {
        if (!meetingsMap[sid].some((mm) => mm.id === meeting.id)) meetingsMap[sid].push(meeting);
      }
    });

    setMeetingsByStaff(meetingsMap);

    // 5) compute busy periods
    const perStaffBusyLocal = {};
    const perPeriodDetailsLocal = {};
    for (let p = 1; p <= 7; p++) perPeriodDetailsLocal[p] = {};

    selectedStaffIds.forEach((sid) => {
      const sBusy = new Set();

      const ttRow = ttMap[sid];
      const ttBusy = busyPeriodsFromTimetableRow(ttRow, dayKey);
      ttBusy.forEach((x) => {
        sBusy.add(x);
        perPeriodDetailsLocal[x][sid] = {
          reason: "class",
          meta: (ttRow && ttRow[dayKey] && ttRow[dayKey][x - 1]) || "Class",
        };
      });

      const staffMeetings = meetingsMap[sid] || [];
      staffMeetings.forEach((m) => {
        for (const pt of PERIOD_TIME_MAP) {
          if (meetingOverlapsPeriod(m, selectedDate, pt)) {
            sBusy.add(pt.period);
            const prev = perPeriodDetailsLocal[pt.period][sid];
            if (prev) {
              // previous exists (likely class) — convert/append to array
              if (!Array.isArray(prev.meta)) prev.meta = [prev.meta];
              prev.meta.push({ type: "meeting", meetingId: m.id, title: m.title, start_time: m.start_time, end_time: m.end_time, location: m.location });
              // normalize reason to indicate mixed content
              prev.reason = "mixed";
            } else {
              perPeriodDetailsLocal[pt.period][sid] = {
                reason: "meeting",
                meta: { meetingId: m.id, title: m.title, start_time: m.start_time, end_time: m.end_time, location: m.location },
              };
            }
          }
        }
      });

      perStaffBusyLocal[sid] = sBusy;
    });

    // 6) available counts
    const availCountLocal = {};
    for (let p = 1; p <= 7; p++) {
      let free = 0;
      selectedStaffIds.forEach((sid) => {
        const busySet = perStaffBusyLocal[sid] || new Set();
        if (!busySet.has(p)) free++;
      });
      availCountLocal[p] = free;
    }

    // 7) best periods
    const exactCommon = [];
    for (let p = 1; p <= 7; p++) if (availCountLocal[p] === selectedStaffIds.length) exactCommon.push(p);
    let maxFree = 0;
    for (let p = 1; p <= 7; p++) maxFree = Math.max(maxFree, availCountLocal[p]);
    const fallbackBest = [];
    for (let p = 1; p <= 7; p++) if (availCountLocal[p] === maxFree) fallbackBest.push(p);

    setPerStaffBusy(perStaffBusyLocal);
    setAvailableCount(availCountLocal);
    setPerPeriodDetails(perPeriodDetailsLocal);
    setBestPeriods({ exactCommon, fallbackBest });

    setAnalyzing(false);
  };

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (deptFilter !== "All" && s.dept !== deptFilter) return false;
      if (!q) return true;
      return (s.name || "").toLowerCase().includes(q) || (s.dept || "").toLowerCase().includes(q) || (s.location || "").toLowerCase().includes(q);
    });
  }, [staff, search, deptFilter]);

  const colorForRatio = (ratio) => {
    if (ratio === 1) return "bg-green-700 text-white";
    if (ratio >= 0.75) return "bg-green-400 text-white";
    if (ratio >= 0.5) return "bg-green-200 text-gray-800";
    if (ratio >= 0.25) return "bg-yellow-200 text-gray-800";
    if (ratio > 0) return "bg-red-200 text-gray-800";
    return "bg-red-500 text-white";
  };

  const [activePeriod, setActivePeriod] = useState(null);
  const currentPeriodTimes = getPeriodTimeMap(getDayKeyFromDate(selectedDate));

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-25 pt-4">
      <header className="max-w-6xl mx-auto mb-3 flex items-left justify-between flex-col ml-1 mt-3">
        <div className="flex items-center gap-3">
          <img src="/staffo.png" alt="Staffo" className="w-32 cursor-pointer" onClick={() => (window.location.href = "/")} />
        </div>
        <h1 className="text-xl font-semibold text-gray-800 ml-2 mt-2">Advanced Availability (Period-based)</h1>
      </header>

      <main className="max-w-6xl mx-auto space-y-5">
        {/* Controls (search, date, dept) */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <MagnifyingGlass size={22} className="text-gray-500 absolute left-3.5 top-3" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..." className="w-full rounded-xl py-2.5 pl-11 pr-4 shadow-sm border border-gray-200 focus:outline-none" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Select date</label>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Department</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {FILTERS.map((f) => (
                  <button key={f} onClick={() => setDeptFilter(f)} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${deptFilter === f ? "bg-black text-white" : "bg-white text-gray-700 border border-gray-200"}`} type="button">
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* staff list + selection */}
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-600 mb-2">Tap to select staff to analyze</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="col-span-1 md:col-span-2 bg-white rounded-2xl p-3 shadow-sm max-h-64 overflow-auto">
                {loadingStaff ? (
                  <div className="text-sm text-gray-500">Loading staff…</div>
                ) : (
                  filteredStaff.map((s) => {
                    const selected = selectedStaffIds.includes(s.id);
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0">
                        <div className="flex items-center gap-3">
                          <img src={s.photo_url || "/profile-icon.png"} alt={s.name} className="w-9 h-9 rounded-full object-cover" onError={(e) => (e.currentTarget.src = "/profile-icon.png")} />
                          <div>
                            <div className="text-sm font-medium">{s.name}</div>
                            <div className="text-xs text-gray-500">{s.designation ? `${s.designation} • ` : ""}{s.dept || "No Dept"}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleStaffSelection(s.id)} className={`px-3 py-1 rounded-full text-xs ${selected ? "bg-black text-white" : "bg-white border border-gray-200"}`}>
                            {selected ? "Selected" : "Select"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selected staff preview + analyze CTA */}
              <div className="bg-white rounded-2xl p-3 shadow-sm">
                <p className="text-xs text-gray-600 mb-2">Selected staff</p>
                <div className="flex flex-wrap gap-2">
                  {selectedStaffIds.length === 0 && <div className="text-sm text-gray-500">None selected</div>}
                  {selectedStaffIds.map((id) => {
                    const s = staff.find((x) => x.id === id) || { name: "Unknown", photo_url: "/profile-icon.png" };
                    return (
                      <div key={id} className="flex items-center gap-2 px-2 py-1 bg-gray-100 rounded-full">
                        <img src={s.photo_url} alt={s.name} className="w-6 h-6 rounded-full object-cover" onError={(e) => (e.currentTarget.src = "/profile-icon.png")} />
                        <span className="text-xs">{s.name}</span>
                        <button onClick={() => { toggleStaffSelection(id); analyze(); setHideHeatMap(true); }} className="ml-1 text-lg text-red-500 cursor-pointer">×</button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <button onClick={() => { analyze(); setHideHeatMap(false); }} disabled={analyzing} className="w-full bg-black text-white px-3 py-2 rounded-xl text-sm cursor-pointer">
                    {analyzing ? "Analyzing…" : "Analyze availability"}
                  </button>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  <div>Best exact free periods: {bestPeriods.exactCommon.length ? bestPeriods.exactCommon.join(", ") : "None"}</div>
                  <div>Fallback best (max free): {bestPeriods.fallbackBest.length ? bestPeriods.fallbackBest.join(", ") : "—"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Heatmap */}
        {!hideHeatMap && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">7-Period Heatmap for {selectedDate}</div>
                <div className="text-xs text-gray-500">Click a period to see per-staff availability details</div>
              </div>
              <div className="text-xs text-gray-500">Selected: {selectedStaffIds.length}</div>
            </div>

            <div className="flex gap-1 flex-wrap">
              {currentPeriodTimes.map((pt) => {
                const free = availableCount[pt.period] ?? (selectedStaffIds.length ? 0 : 0);
                const ratio = selectedStaffIds.length ? free / selectedStaffIds.length : 0;
                const classes = colorForRatio(ratio);
                return (
                  <button
                    key={pt.period}
                    onClick={() => setActivePeriod(pt.period)}
                    className={`flex-1 rounded-xl py-3 px-1 flex flex-col items-center cursor-pointer justify-center ${classes} shadow-sm`}
                  >
                    <div className="text-sm font-semibold">P{pt.period}</div>
                    <div className="text-xs mt-1">{free}/{selectedStaffIds.length || 0} free</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Details */}
        {activePeriod && (
          <div className="mt-4 bg-gray-50 p-3 rounded-lg">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium">Period {activePeriod} details</div>
                <div className="text-xs text-gray-500">Time: {currentPeriodTimes[activePeriod - 1].start.slice(0,5)} - {currentPeriodTimes[activePeriod - 1].end.slice(0,5)}</div>
              </div>
              <div>
                <button onClick={() => setActivePeriod(null)} className="text-xs text-gray-500">Close</button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {selectedStaffIds.length === 0 && <div className="text-sm text-gray-500">No staff selected</div>}
              {selectedStaffIds.map((sid) => {
                const s = staff.find((x) => x.id === sid) || { name: "Unknown", photo_url: "/profile-icon.png" };
                const busySet = perStaffBusy[sid] || new Set();
                const isBusy = busySet.has(activePeriod);
                const details = perPeriodDetails[activePeriod] ? perPeriodDetails[activePeriod][sid] : null;
                return (
                  <div key={sid} className="bg-white p-3 rounded-lg shadow-sm flex items-start gap-3">
                    <img src={s.photo_url || "/profile-icon.png"} alt={s.name} className="w-10 h-10 rounded-full object-cover" onError={(e) => (e.currentTarget.src = "/profile-icon.png")} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{s.name}</div>
                          <div className="text-xs text-gray-500">{s.dept || "No Dept"}</div>
                        </div>
                        <div className={`text-[11px] px-2 py-0.5 rounded-full ${isBusy ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                          {isBusy ? "Busy" : "Free"}
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-gray-600">
                        {isBusy && details ? (
                          // use helper to render both class and meeting if both exist
                          renderBusyDetails(details)
                        ) : !isBusy ? (
                          <div>Free during this period</div>
                        ) : (
                          <div>No detail available</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
