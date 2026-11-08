
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./staff.css";

type AppointmentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed";

type AppointmentRow = {
  id: string;
  reference: string;
  patient_name: string;
  patient_email: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  created_at: string;
};

type AppointmentFilter = AppointmentStatus | "all";

function formatDate(dateValue: string) {
  if (!dateValue) return "—";

  const date = new Date(`${dateValue}T12:00:00`);

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(timeValue: string) {
  if (!timeValue) return "—";

  const [hourText, minuteText] = timeValue.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText ?? "0");

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return timeValue;
  }

  const hour12 = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function getTodayPH() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function getTodayLabel() {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function getPatientInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

export default function StaffDashboard() {
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [filter, setFilter] =
    useState<AppointmentFilter>("all");

  const [search, setSearch] = useState("");

  // SIDEBAR NAVIGATION
  const dashboardRef = useRef<HTMLElement | null>(null);
  const appointmentsRef = useRef<HTMLElement | null>(null);

  const [activeSection, setActiveSection] = useState<
    "dashboard" | "appointments"
  >("dashboard");

  function goToDashboard() {
    setActiveSection("dashboard");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function goToAppointments() {
    setActiveSection("appointments");

    appointmentsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // ============================================
  // LOAD APPOINTMENTS FROM SUPABASE
  // ============================================

  async function loadAppointments(showLoading = false) {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const { data, error: queryError } = await supabase
        .from("dental_appointments")
        .select(
          "id,reference,patient_name,patient_email,service,appointment_date,appointment_time,status,created_at"
        )
        .order("created_at", {
          ascending: false,
        });

      if (queryError) {
        throw queryError;
      }

      setRows((data || []) as AppointmentRow[]);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load appointments."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ============================================
  // AUTOMATIC REFRESH
  // ============================================

  useEffect(() => {
    void loadAppointments(true);

    const interval = window.setInterval(() => {
      void loadAppointments();
    }, 10000);

    const handleFocus = () => {
      void loadAppointments();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // ============================================
  // UPDATE APPOINTMENT STATUS
  // ============================================

  async function changeStatus(
    id: string,
    status: AppointmentStatus
  ) {
    if (!supabase || busyId !== null) return;

    const action =
      status === "approved"
        ? "approve"
        : status === "rejected"
          ? "reject"
          : "complete";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} this appointment?`
    );

    if (!confirmed) return;

    setBusyId(id);
    setError("");

    try {
      const { error: updateError } = await supabase.rpc(
        "staff_update_appointment_status",
        {
          p_appointment_id: id,
          p_status: status,
        }
      );

      if (updateError) {
        throw updateError;
      }

      await loadAppointments();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update the appointment."
      );
    } finally {
      setBusyId(null);
    }
  }

  // ============================================
  // DASHBOARD STATISTICS
  // ============================================

  const stats = useMemo(() => {
    const today = getTodayPH();

    return {
      total: rows.length,

      pending: rows.filter(
        (a) => a.status === "pending"
      ).length,

      approved: rows.filter(
        (a) => a.status === "approved"
      ).length,

      completed: rows.filter(
        (a) => a.status === "completed"
      ).length,

      rejected: rows.filter(
        (a) => a.status === "rejected"
      ).length,

      today: rows.filter(
        (a) => a.appointment_date === today
      ).length,

      upcoming: rows.filter(
        (a) =>
          a.appointment_date >= today &&
          a.status === "approved"
      ).length,
    };
  }, [rows]);

  // ============================================
  // SEARCH AND FILTER
  // ============================================

  const displayed = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return rows.filter((a) => {
      const matchesStatus =
        filter === "all" || a.status === filter;

      const searchable = [
        a.patient_name,
        a.patient_email,
        a.service,
        a.reference,
        a.appointment_date,
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesStatus &&
        (keyword === "" || searchable.includes(keyword))
      );
    });
  }, [rows, filter, search]);

  // ============================================
  // LATEST APPOINTMENT
  // ============================================

  const latestRequest = rows[0] ?? null;

  // ============================================
  // TODAY'S APPOINTMENTS
  // ============================================

  const todayAppointments = useMemo(() => {
    const today = getTodayPH();

    return rows
      .filter(
        (a) =>
          a.appointment_date === today &&
          a.status !== "rejected"
      )
      .sort((a, b) =>
        a.appointment_time.localeCompare(b.appointment_time)
      );
  }, [rows]);

  // ============================================
  // UI
  // ============================================

  return (
    <div className="staff-app">
      {/* SIDEBAR */}
      <aside className="staff-sidebar">
        <div className="staff-brand">
          <div className="staff-brand-logo">🦷</div>

          <div>
            <h2>CEMPRON</h2>
            <p>Secretary / Staff Portal</p>
          </div>
        </div>

        <p className="staff-side-label">
          STAFF MENU
        </p>

        {/* CLICKABLE DASHBOARD */}
        <button
          type="button"
          className={`staff-nav-card staff-nav-button ${
            activeSection === "dashboard" ? "active" : ""
          }`}
          onClick={goToDashboard}
        >
          <div>
            <strong>Dashboard</strong>
            <small>Clinic overview</small>
          </div>
        </button>

        {/* CLICKABLE APPOINTMENT REQUESTS */}
        <button
          type="button"
          className={`staff-nav-card staff-nav-button ${
            activeSection === "appointments" ? "active" : ""
          }`}
          onClick={goToAppointments}
        >
          <div>
            <strong>Appointment Requests</strong>
            <small>Manage patient bookings</small>
          </div>
        </button>
      </aside>

      {/* MAIN DASHBOARD */}
      <main
        className="staff-main"
        ref={dashboardRef}
      >
        {/* HEADER */}
        <header className="staff-topbar">
          <div>
            <h1>Secretary Dashboard</h1>
            <p>{getTodayLabel()}</p>
          </div>

          <button
            type="button"
            className="staff-refresh-btn"
            onClick={() => void loadAppointments()}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
        </header>

        {/* WELCOME BANNER */}
        <section className="staff-hero">
          <div className="staff-hero-text">
            <span className="staff-hero-tag">
              CEMPRON DENTAL CLINIC
            </span>

            <h2>Welcome to Your Dashboard</h2>

            <p>
              Stay organized and manage patient
              appointments with ease. Review
              incoming requests, track bookings,
              and keep daily clinic operations
              running smoothly.
            </p>
          </div>

          <div className="staff-hero-badge">
            <div className="staff-hero-circle">
              🦷
            </div>
          </div>
        </section>

        {/* STATISTICS CARDS */}
        <section className="staff-stats-grid">
          <div className="staff-stat-card">
            <div>
              <p>Total Appointments</p>
              <h3>{stats.total}</h3>
            </div>
          </div>

          <div className="staff-stat-card">
            <div>
              <p>Pending Requests</p>
              <h3>{stats.pending}</h3>
            </div>
          </div>

          <div className="staff-stat-card">
            <div>
              <p>Approved</p>
              <h3>{stats.approved}</h3>
            </div>
          </div>

          <div className="staff-stat-card">
            <div>
              <p>Completed</p>
              <h3>{stats.completed}</h3>
            </div>
          </div>
        </section>

        {/* APPOINTMENT OVERVIEW AND LATEST */}
        <section className="staff-summary-row">
          <div className="staff-summary-card">
            <div className="staff-summary-head">
              <h3>Appointment Overview</h3>

              <span className="staff-chip light">
                Supabase Data
              </span>
            </div>

            <div className="staff-summary-list">
              <div>
                <strong>{stats.today}</strong>
                <span>Today's Appointments</span>
              </div>

              <div>
                <strong>{stats.upcoming}</strong>
                <span>Upcoming Approved</span>
              </div>

              <div>
                <strong>{stats.rejected}</strong>
                <span>Rejected Requests</span>
              </div>

              <div>
                <strong>{stats.completed}</strong>
                <span>Completed Visits</span>
              </div>
            </div>
          </div>

          <div className="staff-summary-card">
            <div className="staff-summary-head">
              <h3>Latest Appointment Request</h3>

              <span className="staff-chip">
                Most Recent
              </span>
            </div>

            {latestRequest ? (
              <div className="staff-latest-box">
                <strong>
                  {latestRequest.patient_name}
                </strong>

                <p>{latestRequest.service}</p>

                <small>
                  {formatDate(latestRequest.appointment_date)}
                  {" • "}
                  {formatTime(latestRequest.appointment_time)}
                </small>

                <div style={{ marginTop: 12 }}>
                  <span
                    className={`staff-status-badge ${latestRequest.status}`}
                  >
                    {latestRequest.status}
                  </span>
                </div>
              </div>
            ) : (
              <p className="staff-muted">
                No appointment requests yet.
              </p>
            )}
          </div>
        </section>

        {/* TODAY'S APPOINTMENTS */}
        <section
          className="staff-summary-card"
          style={{ marginBottom: 24 }}
        >
          <div className="staff-summary-head">
            <h3>Today's Appointments</h3>

            <span className="staff-chip light">
              {stats.today} Scheduled
            </span>
          </div>

          {todayAppointments.length === 0 ? (
            <div className="staff-empty-state">
              <h3>No Appointments Today</h3>

              <p>
                Patient appointments scheduled
                for today will appear here.
              </p>
            </div>
          ) : (
            <div className="staff-table-scroll">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Service</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {todayAppointments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="staff-patient-cell">
                          <div className="staff-avatar">
                            {getPatientInitial(a.patient_name)}
                          </div>

                          <div>
                            <strong>{a.patient_name}</strong>
                            <small>{a.patient_email}</small>
                          </div>
                        </div>
                      </td>

                      <td>{a.service}</td>

                      <td>
                        {formatTime(a.appointment_time)}
                      </td>

                      <td>
                        <span
                          className={`staff-status-badge ${a.status}`}
                        >
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* PATIENT APPOINTMENT MANAGEMENT */}
        <section
          ref={appointmentsRef}
          className="staff-table-card"
          id="appointment-requests"
        >
          <div className="staff-table-header">
            <div>
              <h2>Patient Appointments</h2>

              <p>
                View and manage all patient
                appointment requests.
              </p>
            </div>

            <div className="staff-toolbar">
              <input
                type="search"
                className="staff-search"
                placeholder="Search patient or service..."
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
              />

              <label className="staff-filter">
                <span>Show:</span>

                <select
                  value={filter}
                  onChange={(e) =>
                    setFilter(
                      e.target.value as AppointmentFilter
                    )
                  }
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div
              className="staff-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* LOADING / EMPTY / APPOINTMENTS */}
          {loading ? (
            <div className="staff-empty-state">
              <h3>Loading Appointments</h3>

              <p>
                Retrieving patient requests
                from Supabase...
              </p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="staff-empty-state">
              <h3>No Appointments Found</h3>

              <p>
                There are no appointment requests
                matching your search or filter.
              </p>
            </div>
          ) : (
            <div className="staff-table-scroll">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Service</th>
                    <th>Schedule</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {displayed.map((a) => (
                    <tr key={a.id}>
                      {/* PATIENT */}
                      <td>
                        <div className="staff-patient-cell">
                          <div className="staff-avatar">
                            {getPatientInitial(a.patient_name)}
                          </div>

                          <div>
                            <strong>{a.patient_name}</strong>
                            <small>{a.patient_email}</small>
                          </div>
                        </div>
                      </td>

                      {/* SERVICE */}
                      <td>
                        <span className="staff-service-text">
                          {a.service}
                        </span>
                      </td>

                      {/* SCHEDULE */}
                      <td>
                        <div className="staff-schedule-cell">
                          <strong>
                            {formatDate(a.appointment_date)}
                          </strong>

                          <small>
                            {formatTime(a.appointment_time)}
                          </small>
                        </div>
                      </td>

                      {/* REFERENCE */}
                      <td className="staff-reference">
                        {a.reference}
                      </td>

                      {/* STATUS */}
                      <td>
                        <span
                          className={`staff-status-badge ${a.status}`}
                        >
                          {a.status}
                        </span>
                      </td>

                      {/* ACTION BUTTONS */}
                      <td>
                        <div className="staff-actions">
                          {a.status === "pending" && (
                            <>
                              <button
                                type="button"
                                className="staff-action-btn approve"
                                disabled={busyId !== null}
                                onClick={() =>
                                  void changeStatus(
                                    a.id,
                                    "approved"
                                  )
                                }
                              >
                                {busyId === a.id
                                  ? "Updating..."
                                  : "Approve"}
                              </button>

                              <button
                                type="button"
                                className="staff-action-btn reject"
                                disabled={busyId !== null}
                                onClick={() =>
                                  void changeStatus(
                                    a.id,
                                    "rejected"
                                  )
                                }
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {a.status === "approved" && (
                            <button
                              type="button"
                              className="staff-action-btn complete"
                              disabled={busyId !== null}
                              onClick={() =>
                                void changeStatus(
                                  a.id,
                                  "completed"
                                )
                              }
                            >
                              {busyId === a.id
                                ? "Updating..."
                                : "Complete"}
                            </button>
                          )}

                          {(a.status === "completed" ||
                            a.status === "rejected") && (
                            <span className="staff-dash">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="staff-note">
          Patient appointment requests are saved
          in Supabase. The secretary can approve,
          reject, or complete appointments.
          Appointment availability and
          double-booking are not yet automatically
          validated.
        </p>
      </main>
    </div>
  );
}
