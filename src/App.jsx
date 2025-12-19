import React, { useEffect, useState } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { supabase } from "./utils/supabase";

import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import StaffDashboard from "./pages/StaffDashboard";
import MeetingDashboard from "./pages/MeetingDashboard";
import Notfound from "./pages/Notfound";
import Availability from "./pages/Availability";
import Admins from "./pages/Admins";
import Download from "./pages/Download";

import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import NavBar from "./components/NavBar"; // Import NavBar here

import toast from "react-hot-toast";

// -----------------------------------------
// Notification helpers
// -----------------------------------------
function playNotificationSound() {
  const audio = new Audio("/notification.mp3");
  audio.play().catch(() => { });
}

function showToast(title, body) {
  toast.success(`${title}\n${body}`, { duration: 8000 });
}

// -----------------------------------------
// Meeting wrapper → uses ?staffId=
// -----------------------------------------
function MeetingDashboardWrapper() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const staffId = params.get("staffId");

  return <MeetingDashboard staffId={staffId} />;
}

// -----------------------------------------
// Landing Redirect Wrapper
// -----------------------------------------
function LandingWrapper({ user }) {
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Landing />;
}

// -----------------------------------------
// Main App
// -----------------------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [staffId, setStaffId] = useState(null);
  const [loading, setLoading] = useState(true);

  // ------------------------------
  // Auth session listener
  // ------------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // ------------------------------
  // Fetch staff table → staff.id
  // ------------------------------
  useEffect(() => {
    if (!user?.id) {
      setStaffId(null);
      return;
    }

    const loadStaff = async () => {
      const { data } = await supabase
        .from("staff")
        .select("id")
        .eq("profile_id", user.id)
        .single();

      setStaffId(data?.id ?? null);
    };

    loadStaff();
  }, [user?.id]);

  // ------------------------------
  // Real-time notifications
  // ------------------------------
  useEffect(() => {
    if (!staffId) return;

    const channel = supabase
      .channel(`notification_${staffId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          table: "notifications",
          schema: "public",
          filter: `staff_id=eq.${staffId}`,
        },
        (payload) => {
          playNotificationSound();
          showToast(payload.new.title, payload.new.body);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffId]);

  if (loading) return null;

  // ------------------------------
  // Routes
  // ------------------------------
  return (
    <>
      {/* Conditional NavBar: 
          Only show if a user is logged in AND they are identified as Staff/Admin (staffId exists).
          Students will not see the NavBar.
      */}
      {user && staffId && <NavBar />}

      <Routes>
        <Route path="/" element={<LandingWrapper user={user} />} />

        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Login />}
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/staffdashboard"
          element={
            <ProtectedRoute>
              <RoleRoute allow={["staff", "admin"]}>
                <StaffDashboard />
              </RoleRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/meetings"
          element={
            <ProtectedRoute>
              <RoleRoute allow={["staff", "admin"]}>
                <MeetingDashboardWrapper />
              </RoleRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/availability"
          element={
            <ProtectedRoute>
              <RoleRoute allow={["staff", "admin"]}>
                <Availability />
              </RoleRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admins"
          element={
            <ProtectedRoute>
              <RoleRoute allow={["admin"]}>
                <Admins />
              </RoleRoute>
            </ProtectedRoute>
          }
        />

        <Route path="/download" element={<Download />} />
        <Route path="/*" element={<Notfound />} />
      </Routes>
    </>
  );
}
