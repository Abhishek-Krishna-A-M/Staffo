import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabase";
import MeetingForm from "../components/MeetingForm";
import MeetingList from "../components/MeetingList";

export default function MeetingDashboard({ staffId }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  // Load meetings hosted by this staff
  const loadMeetings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("host_staff_id", staffId)
      .order("meeting_date", { ascending: true });

    if (error) console.error(error);

    setMeetings(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!staffId) {
      setMeetings([]);
      setLoading(false);
      return;
    }
    loadMeetings();
  }, [staffId]);

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-screen px-4 py-6 bg-gray-50">
      <header className="max-w-full mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/staffo.png"
            alt="Staffo"
            className="w-32 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>

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

      {/* Meeting List */}
      <MeetingList
        meetings={meetings}
        onEdit={(meeting) => {
          setEditingMeeting(meeting);
          setShowForm(true);
        }}
      />

      {/* Meeting Form Modal */}
      {showForm && (
        <MeetingForm
          staffId={staffId}
          meeting={editingMeeting}
          onClose={() => {
            setShowForm(false);
            setEditingMeeting(null);
            loadMeetings();
          }}
        />
      )}
    </div>
  );
}
