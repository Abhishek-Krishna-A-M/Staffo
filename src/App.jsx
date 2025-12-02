import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { supabase } from "./utils/supabase.js";
import Login from "./pages/Login.jsx";
import Landing from "./pages/Landing.jsx";
import Notfound from "./pages/Notfound.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import StaffDashboard from "./pages/StaffDashboard.jsx";
import MeetingDashboard from "./pages/MeetingDashboard.jsx";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";

import toast from "react-hot-toast";

function playNotificationSound() {
  // your sound logic
  const audio = new Audio("/notification.mp3");
  audio.play().catch(() => {});
}
function showToast(title, body) {
  // replace with your toast lib (react-hot-toast / chakra / etc.)
  toast.success(`${title}\n\n${body}`);
}

function App() {
  const [user, setUser] = useState(null);

  // get initial user & listen for auth changes
  useEffect(() => {
    let mounted = true;

    async function fetchUser() {
      // Supabase JS v2:
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      // If using v1 you may need: const currentUser = supabase.auth.user();
      if (mounted) setUser(currentUser);
    }
    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      mounted = false;
      if (authListener?.subscription) authListener.subscription.unsubscribe?.();
    };
  }, []);

  // notification realtime subscription — runs when user becomes available
  useEffect(() => {
    if (!user?.id) return;

    console.log(user.id);

    const channel = supabase
      .channel("staff_notifications") // name can be anything; filter ensures per-user events
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `staff_id=eq.${user.id}`,
        },
        (payload) => {
          playNotificationSound();
          showToast(payload.new.title, payload.new.body);
        }
      )
      .subscribe();

    return () => {
      // remove the channel subscription on logout/unmount
      try {
        supabase.removeChannel(channel);
      } catch (err) {
        // fallback if removeChannel not available
        channel.unsubscribe?.();
      }
    };
  }, [user?.id]);


  // // DEV: log all notification inserts for testing
  // useEffect(() => {
  //   const channel = supabase
  //     .channel("dev_notif_watch")
  //     .on(
  //       "postgres_changes",
  //       { event: "INSERT", schema: "public", table: "notifications" },
  //       (payload) => {
  //         console.log("DEV NOTIF PAYLOAD:", payload); // see full payload
  //       }
  //     )
  //     .subscribe();

  //   return () => supabase.removeChannel(channel);
  // }, []);


  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/staffdashboard" element={<StaffDashboard />} />

        <Route path="/meetings" element={<MeetingDashboard staffId={user?.id} />} />
        <Route path="/*" element={<Notfound />} />
      </Routes>
    </>
  );
}

export default App;
