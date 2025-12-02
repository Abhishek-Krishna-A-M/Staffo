// pages/MeetingDashboard.jsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabase";
import MeetingForm from "../components/MeetingForm";
import MeetingList from "../components/MeetingList";

export default function MeetingDashboard() {
  const navigate = useNavigate();

  const [authUser, setAuthUser] = useState(null);
  const [staff, setStaff] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // trigger reloads

  // helper to build ISO date for today if needed elsewhere
  const todayISO = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // -------------------------------------------------------------
  // FETCH AUTH USER → STAFF ROW → MEETINGS (host OR participant)
  // Each meeting will get a `participants` array of staff_ids.
  // Editing is allowed only when current staff.id === meeting.host_staff_id.
  // -------------------------------------------------------------
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      setLoading(true);

      // 1) Get auth user (session)
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) console.error("session error:", sessErr);

      const user = sessionData?.session?.user || null;
      if (!user) {
        if (mounted) {
          setAuthUser(null);
          setLoading(false);
        }
        return;
      }
      if (mounted) setAuthUser(user);

      // 2) Resolve staff row for this profile
      const { data: staffRow, error: staffErr } = await supabase
        .from("staff")
        .select("*")
        .eq("profile_id", user.id)
        .single();

      if (staffErr) {
        console.error("Failed to load staff row:", staffErr);
        if (mounted) {
          setStaff(null);
          setMeetings([]);
          setLoading(false);
        }
        return;
      }
      if (mounted) setStaff(staffRow);

      // 3) Fetch meetings where user is host
      const { data: hostMeetings = [], error: hostErr } = await supabase
        .from("meetings")
        .select("*")
        .eq("host_staff_id", staffRow.id)
        .order("meeting_date", { ascending: true });

      if (hostErr) console.error("Error loading host meetings:", hostErr);

      // 4) Fetch meeting_participants rows where this staff is a participant
      const { data: participantRows = [], error: partErr } = await supabase
        .from("meeting_participants")
        .select("meeting_id, staff_id")
        .eq("staff_id", staffRow.id);

      if (partErr) console.error("Error loading meeting participants:", partErr);

      // 5) If participantRows exist, fetch the meetings for those meeting_ids (avoid duplicates)
      let participantMeetings = [];
      try {
        const meetingIds = Array.from(new Set(participantRows.map((r) => r.meeting_id))).filter(Boolean);
        if (meetingIds.length > 0) {
          const { data: pMeetings = [], error: pMeetErr } = await supabase
            .from("meetings")
            .select("*")
            .in("id", meetingIds)
            .order("meeting_date", { ascending: true });

          if (pMeetErr) console.error("Error loading participant meetings:", pMeetErr);
          participantMeetings = pMeetings || [];
        }
      } catch (err) {
        console.error("Error fetching participant meetings:", err);
      }

      // 6) Merge meetings (dedupe by id)
      const meetingsMap = {};
      (hostMeetings || []).forEach((m) => (meetingsMap[m.id] = m));
      (participantMeetings || []).forEach((m) => (meetingsMap[m.id] = m));
      const mergedMeetings = Object.values(meetingsMap);

      // 7) Load meeting_participants for all merged meeting ids to attach participants array
      const mergedIds = mergedMeetings.map((m) => m.id).filter(Boolean);
      let allParticipants = [];
      if (mergedIds.length > 0) {
        const { data: mpRows = [], error: mpErr } = await supabase
          .from("meeting_participants")
          .select("meeting_id, staff_id")
          .in("meeting_id", mergedIds);

        if (mpErr) console.error("Error loading meeting_participants rows:", mpErr);
        allParticipants = mpRows || [];
      }

      // 8) Attach participants[] to each meeting object (array of staff ids)
      const meetingsWithParticipants = mergedMeetings.map((m) => {
        const parts = allParticipants
          .filter((pr) => String(pr.meeting_id) === String(m.id))
          .map((pr) => pr.staff_id);
        return { ...m, participants: parts };
      });

      if (mounted) {
        setMeetings(meetingsWithParticipants);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  // Reload meetings after create/edit/delete — increments refreshKey to trigger effect
  const reloadMeetings = useCallback(async () => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (loading)
    return (
      <div className="p-6 text-center">
        <img src="/staffo.png" className="w-24 mx-auto mb-5" />
        Loading meetings…
      </div>
    );

  if (!authUser || !staff)
    return (
      <div className="p-6 text-center text-gray-500">Staff profile not found.</div>
    );

  return (
    <div className="min-h-screen px-4 py-6 bg-gray-50">
      {/* HEADER */}
      <header className="max-w-full mx-auto mb-6 flex items-center justify-between">
        <img
          src="/staffo.png"
          alt="Staffo"
          className="w-32 cursor-pointer"
          onClick={() => navigate("/staffdashboard")}
        />

        <button
          onClick={() => {
            setEditingMeeting(null);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-black text-white rounded-xl"
        >
          + New Meeting
        </button>
      </header>

      {/* MEETING LIST
          - pass userId so MeetingList can decide which meetings to show and enable edit for host only
          - MeetingList expects `meetings` that include `.participants` array (staff ids)
      */}
      <MeetingList
        meetings={meetings}
        userId={staff.id}
        onEdit={(meeting) => {
          // only allow edit if current staff is host (MeetingList already restricts onEdit to host)
          setEditingMeeting(meeting);
          setShowForm(true);
        }}
      />

      {/* FORM MODAL */}
      {showForm && (
        <MeetingForm
          staffId={staff.id} // ✔ Correct staff.id for FK
          meeting={editingMeeting}
          onClose={() => {
            setShowForm(false);
            setEditingMeeting(null);
            reloadMeetings(); // Refresh list
          }}
        />
      )}
    </div>
  );
}
