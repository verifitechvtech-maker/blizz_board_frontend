import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { PageLoader } from "../components/common/Loader";

/* Pages load on demand; the preloader shows while each one downloads */
const Login = lazy(() => import("../pages/Login/Login"));
const VerifyEmail = lazy(() => import("../pages/VerifyEmail/VerifyEmail"));
const TaskEmailAction = lazy(() => import("../pages/TaskEmailAction/TaskEmailAction"));

const MainDash = lazy(() => import("../pages/Dashboard/maindash"));
const DashboardPage = lazy(() => import("../pages/Dashboard/DashboardPage"));
const UsersPage = lazy(() => import("../pages/Dashboard/users"));
const TasksPage = lazy(() => import("../pages/Dashboard/tasks"));
const TaskBank = lazy(() => import("../pages/Dashboard/taskbank"));
const TaskCalendar = lazy(() => import("../pages/Dashboard/taskcalender"));
const MinutesOfMeeting = lazy(() => import("../pages/Dashboard/mom"));
const DashboardChart = lazy(() => import("../pages/Dashboard/DashboardChart"));
const Support = lazy(() => import("../pages/Dashboard/support"));
const Roles = lazy(() => import("../pages/Dashboard/roles"));
const Report = lazy(() => import("../pages/Dashboard/report"));
const SettingsPage = lazy(() => import("../pages/Dashboard/setting"));
const SuperAdminDashboard = lazy(() => import("../pages/Dashboard/SuperAdminDashboard"));
const ActivityPage = lazy(() => import("../pages/Dashboard/Activity"));
const MeetingRoom = lazy(() => import("../pages/Meet/MeetingRoom"));

/* 🔒 Route guards (backend enforces the same rules on every API) */
import AdminRoute, {
  RequireAuth,
  SuperAdminRoute,
  PermissionRoute,
} from "../components/adminroutes";

/* =========================================================
   COMMON PAGE STYLES
========================================================= */

const pageStyles = {
  page: {
    maxWidth: "1200px",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },

  h1: {
    fontSize: "28px",
    fontWeight: "800",
    color: "#18B3B2",
    margin: "0 0 6px 0",
  },

  desc: {
    fontSize: "15px",
    color: "#6b7280",
    margin: "0 0 24px 0",
    fontWeight: "400",
  },
};

/* =========================================================
   FALLBACK / SIMPLE PAGES
========================================================= */

const TaskBankPage = () => (
  <div style={pageStyles.page}>
    <h1 style={pageStyles.h1}>Task Bank</h1>
    <p style={pageStyles.desc}>
      Browse and manage task templates
    </p>
  </div>
);

const TaskCalendarPage = () => (
  <div style={pageStyles.page}>
    <h1 style={pageStyles.h1}>Task Calendar</h1>
    <p style={pageStyles.desc}>
      View and manage tasks on a calendar
    </p>
  </div>
);

const MoMPage = () => (
  <div style={pageStyles.page}>
    <h1 style={pageStyles.h1}>MoM</h1>
    <p style={pageStyles.desc}>
      Minutes of meeting
    </p>
  </div>
);

const ChatsPage = () => (
  <div style={pageStyles.page}>
    <h1 style={pageStyles.h1}>Chats</h1>
    <p style={pageStyles.desc}>
      Team communication
    </p>
  </div>
);

const SupportPage = () => (
  <div style={pageStyles.page}>
    <h1 style={pageStyles.h1}>Support</h1>
    <p style={pageStyles.desc}>
      Help and support tickets
    </p>
  </div>
);

const RolesPage = () => (
  <div style={pageStyles.page}>
    <h1 style={pageStyles.h1}>Roles</h1>
    <p style={pageStyles.desc}>
      Manage roles and access
    </p>
  </div>
);

const ReportsPage = () => (
  <div style={pageStyles.page}>
    <h1 style={pageStyles.h1}>Reports</h1>
    <p style={pageStyles.desc}>
      Analytics and reports
    </p>
  </div>
);

/* =========================================================
   APP ROUTES
========================================================= */

const AppRoutes = () => {
  return (
    <Suspense fallback={<PageLoader fullScreen text="Loading…" />}>
    <Routes>

      {/* =====================================================
          LOGIN
      ===================================================== */}

      <Route
        path="/"
        element={<Navigate to="/login" replace />}
      />

      <Route
        path="/login"
        element={<Login />}
      />

      {/* Public — link from the verification email (one-time password reveal) */}
      <Route
        path="/verify-email/:token"
        element={<VerifyEmail />}
      />

      {/* Public — task page from the assignment email (view + update the status) */}
      <Route
        path="/task-action/:token"
        element={<TaskEmailAction />}
      />

      {/* Video call of a MoM meeting — full screen, link from the invitation email */}
      <Route
        path="/meet/:roomId"
        element={
          <RequireAuth>
            <MeetingRoom />
          </RequireAuth>
        }
      />

      {/* =====================================================
          DASHBOARD LAYOUT

          MainDash must contain <Outlet />
          so these pages render inside MainDash.
      ===================================================== */}

      <Route
        element={
          <RequireAuth>
            <MainDash />
          </RequireAuth>
        }
      >

        {/* =================================================
            SUPER ADMIN DASHBOARD
            🔒 SuperAdmin only
        ================================================= */}

        <Route
          path="/superadmin/dashboard"
          element={
            <SuperAdminRoute>
              <SuperAdminDashboard />
            </SuperAdminRoute>
          }
        />

        {/* =================================================
            DASHBOARD
        ================================================= */}

        <Route
          path="/dashboard"
          element={<DashboardPage />}
        />

        {/* =================================================
            USERS
            🔒 CHANGED: admin only
        ================================================= */}

        <Route
          path="/dashboard/users"
          element={
            <PermissionRoute module="users">
              <UsersPage />
            </PermissionRoute>
          }
        />

        {/* =================================================
            TASKS
        ================================================= */}

        <Route
          path="/dashboard/tasks"
          element={
            <PermissionRoute module="tasks">
              <TasksPage />
            </PermissionRoute>
          }
        />

        {/* =================================================
            TASK BANK
        ================================================= */}

        <Route
          path="/dashboard/task-bank"
          element={
            <PermissionRoute module="taskbank">
              <TaskBank />
            </PermissionRoute>
          }
        />

        {/* =================================================
            TASK CALENDAR
        ================================================= */}

        <Route
          path="/dashboard/task-calendar"
          element={
            <PermissionRoute module="calendar">
              <TaskCalendar />
            </PermissionRoute>
          }
        />

        {/* =================================================
            MINUTES OF MEETING
        ================================================= */}

        <Route
          path="/dashboard/mom"
          element={
            <PermissionRoute module="communication">
              <MinutesOfMeeting />
            </PermissionRoute>
          }
        />

        {/* =================================================
            CHATS
        ================================================= */}

        <Route
          path="/dashboard/chats"
          element={
            <PermissionRoute module="chat">
              <DashboardChart />
            </PermissionRoute>
          }
        />

        {/* =================================================
            SUPPORT
        ================================================= */}

        <Route
          path="/dashboard/support"
          element={
            <PermissionRoute module="support">
              <Support />
            </PermissionRoute>
          }
        />

        {/* =================================================
            ROLES
            🔒 CHANGED: admin only
        ================================================= */}

        <Route
          path="/dashboard/roles"
          element={
            <PermissionRoute module="users" action="assign" roles={["SuperAdmin", "Admin"]}>
              <Roles />
            </PermissionRoute>
          }
        />

        {/* =================================================
            REPORTS
        ================================================= */}

        <Route
          path="/dashboard/reports"
          element={
            <PermissionRoute module="reports">
              <Report />
            </PermissionRoute>
          }
        />

        {/* =================================================
            ACTIVITY
            🔒 Admin / SuperAdmin only
        ================================================= */}

        <Route
          path="/dashboard/activity"
          element={
            <AdminRoute>
              <ActivityPage />
            </AdminRoute>
          }
        />

        {/* =================================================
            SETTINGS

            IMPORTANT:
            This is your actual setting.jsx component.
            🔒 Personal settings — any role with settings.view
        ================================================= */}

        <Route
          path="/dashboard/settings"
          element={
            <PermissionRoute module="settings">
              <SettingsPage />
            </PermissionRoute>
          }
        />

      </Route>

      {/* =====================================================
          UNKNOWN URL
      ===================================================== */}

      <Route
        path="*"
        element={<Navigate to="/login" replace />}
      />

    </Routes>
    </Suspense>
  );
};

export default AppRoutes;