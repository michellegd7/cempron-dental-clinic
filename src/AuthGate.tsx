
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";
import StaffDashboard from "./StaffDashboard";
import "./auth.css";

type Portal = "patient" | "staff";
type AuthMode = "login" | "register";

interface AuthGateProps {
  children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [isStaff, setIsStaff] = useState(false);

  const [portal, setPortal] = useState<Portal>("patient");
  const [mode, setMode] = useState<AuthMode>("login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  // ===================================
  // CHECK SUPABASE SESSION AND ROLE
  // ===================================

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }

    const client = supabase;
    let active = true;
    let requestNumber = 0;

    async function checkAccount(nextSession: Session | null) {
      const request = ++requestNumber;

      if (!active) return;

      setChecking(true);

      if (!nextSession) {
        setSession(null);
        setIsStaff(false);
        setChecking(false);
        return;
      }

      const { data, error } = await client
        .from("staff_members")
        .select("user_id")
        .eq("user_id", nextSession.user.id)
        .maybeSingle();

      if (!active || request !== requestNumber) return;

      if (error) {
        setMessage("Unable to verify account: " + error.message);
        setIsError(true);
        setSession(null);
        setIsStaff(false);
      } else {
        setIsStaff(Boolean(data));
        setSession(nextSession);
      }

      setChecking(false);
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        // Avoid Supabase calls inside the auth callback.
        setTimeout(() => {
          void checkAccount(nextSession);
        }, 0);
      }
    );

    void client.auth.getSession().then(({ data }) => {
      void checkAccount(data.session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // ===================================
  // SWITCH PATIENT / STAFF PORTAL
  // ===================================

  function changePortal(nextPortal: Portal) {
    setPortal(nextPortal);
    setMode("login");
    setFullName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setIsError(false);
  }

  function changeMode(nextMode: AuthMode) {
    if (portal === "staff") return;

    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setIsError(false);
  }

  // ===================================
  // LOGIN AND PATIENT REGISTRATION
  // ===================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) return;

    setLoading(true);
    setMessage("");
    setIsError(false);

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (portal === "patient" && mode === "register") {
        if (!fullName.trim()) {
          throw new Error("Please enter your full name.");
        }

        if (password.length < 8) {
          throw new Error(
            "Password must contain at least 8 characters."
          );
        }

        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        if (!data.session) {
          setMode("login");
          setPassword("");
          setConfirmPassword("");
          setMessage(
            "Registration submitted. Please check your email " +
              "for a confirmation link, then log in."
          );
        }
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

        if (error) throw error;

        // Staff login requires existing membership.
        if (portal === "staff" && data.user) {
          const { data: staff, error: staffError } =
            await supabase
              .from("staff_members")
              .select("user_id")
              .eq("user_id", data.user.id)
              .maybeSingle();

          if (staffError || !staff) {
            await supabase.auth.signOut();
            throw new Error(
              "Access denied. This account is not authorized " +
                "as clinic staff."
            );
          }
        }
      }
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed."
      );
    } finally {
      setLoading(false);
    }
  }

  // ===================================
  // LOGOUT
  // ===================================

  async function handleLogout() {
    if (!supabase) return;

    setLoading(true);
    setMessage("");
    setIsError(false);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message);
      setIsError(true);
    } else {
      setSession(null);
      setIsStaff(false);
      setPassword("");
      setConfirmPassword("");
      setMode("login");
      setPortal("patient");
      setMessage("Successfully logged out.");
    }

    setLoading(false);
  }

  // ===================================
  // CONFIGURATION ERROR
  // ===================================

  if (!supabaseConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo">🦷</div>
          <h2>Supabase Setup Required</h2>
          <p>
            Add your Supabase URL and Publishable Key
            to the .env file and restart your website.
          </p>
        </div>
      </div>
    );
  }

  // ===================================
  // LOADING
  // ===================================

  if (checking) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <div className="auth-logo">🦷</div>
          <h2>Cempron Dental Clinic</h2>
          <p>Checking your account...</p>
        </div>
      </div>
    );
  }

  // ===================================
  // AUTHENTICATED DASHBOARD
  // ===================================

  if (session) {
    const name = String(
      session.user.user_metadata?.full_name ||
        session.user.email ||
        "User"
    );

    return (
      <>
        {isStaff ? <StaffDashboard /> : children}

        <div className="patient-account-bar">
          <div className="patient-account-info">
            <span className="patient-avatar">
              {name.charAt(0).toUpperCase()}
            </span>

            <div>
              <strong>{name}</strong>
              <small>
                {isStaff
                  ? "Secretary / Staff"
                  : "Patient Account"}
              </small>
            </div>
          </div>

          <button
            type="button"
            className="patient-logout-button"
            disabled={loading}
            onClick={() => void handleLogout()}
          >
            {loading ? "Signing out..." : "↪ Logout"}
          </button>

          {isError && message && (
            <p className="logout-error" role="alert">
              {message}
            </p>
          )}
        </div>
      </>
    );
  }

  // ===================================
  // LOGIN / REGISTER SCREEN
  // ===================================

  return (
    <div className="auth-screen">
      <div className="auth-layout">
        <section className="auth-intro">
          <div className="auth-brand">
            <div className="auth-brand-icon">🦷</div>

            <div>
              <strong>CEMPRON</strong>
              <span>DENTAL CLINIC</span>
            </div>
          </div>

          <div className="auth-intro-content">
            <span className="auth-eyebrow">
              YOUR SMILE IS OUR PRIORITY
            </span>

            <h1>
              A healthier smile
              <br />
              starts here.
            </h1>

            <p>
              Welcome to Cempron Dental Clinic.
              Access your patient account or
              authorized staff dashboard.
            </p>

            <div className="auth-feature">
              <span>📅</span>
              <div>
                <strong>Patient Appointments</strong>
                <small>
                  Submit and manage appointment requests
                </small>
              </div>
            </div>

            <div className="auth-feature">
              <span>🦷</span>
              <div>
                <strong>Staff Management</strong>
                <small>
                  Review and approve patient appointments
                </small>
              </div>
            </div>

            <div className="auth-feature">
              <span>🔒</span>
              <div>
                <strong>Protected Accounts</strong>
                <small>
                  Authentication powered by Supabase
                </small>
              </div>
            </div>
          </div>

          <p className="auth-intro-footer">
            © {new Date().getFullYear()} Cempron Dental Clinic
          </p>
        </section>

        <section className="auth-form-side">
          <div className="auth-card">
            <div className="auth-logo">🦷</div>

            <span className="auth-form-eyebrow">
              CEMPRON DENTAL CLINIC
            </span>

            <h2>
              {portal === "staff"
                ? "Secretary / Staff Login"
                : mode === "register"
                ? "Patient Registration"
                : "Patient Login"}
            </h2>

            <p className="auth-subtitle">
              {portal === "staff"
                ? "Sign in using your authorized clinic staff account."
                : mode === "register"
                ? "Create your patient account."
                : "Welcome back! Sign in to continue."}
            </p>

            {/* PORTAL SELECTION */}

            <div className="auth-tabs">
              <button
                type="button"
                className={
                  portal === "patient" ? "selected" : ""
                }
                onClick={() => changePortal("patient")}
              >
                Patient
              </button>

              <button
                type="button"
                className={
                  portal === "staff" ? "selected" : ""
                }
                onClick={() => changePortal("staff")}
              >
                Secretary / Staff
              </button>
            </div>

            {/* PATIENT LOGIN / REGISTER OPTIONS */}

            {portal === "patient" && (
              <div className="auth-tabs">
                <button
                  type="button"
                  className={
                    mode === "login" ? "selected" : ""
                  }
                  onClick={() => changeMode("login")}
                >
                  Login
                </button>

                <button
                  type="button"
                  className={
                    mode === "register" ? "selected" : ""
                  }
                  onClick={() => changeMode("register")}
                >
                  Register
                </button>
              </div>
            )}

            {/* LOGIN FORM */}

            <form
              className="auth-form"
              onSubmit={handleSubmit}
            >
              {portal === "patient" &&
                mode === "register" && (
                  <label>
                    Full Name
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) =>
                        setFullName(e.target.value)
                      }
                      placeholder="Enter your full name"
                      autoComplete="name"
                      required
                    />
                  </label>
                )}

              <label>
                Email Address
                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder={
                    portal === "staff"
                      ? "staff@clinic.com"
                      : "example@gmail.com"
                  }
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Password

                <div className="password-field">
                  <input
                    type={
                      showPassword ? "text" : "password"
                    }
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="Enter password"
                    autoComplete={
                      mode === "register" &&
                      portal === "patient"
                        ? "new-password"
                        : "current-password"
                    }
                    required
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              {portal === "patient" &&
                mode === "register" && (
                  <label>
                    Confirm Password
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) =>
                        setConfirmPassword(e.target.value)
                      }
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                )}

              {message && (
                <div
                  role={isError ? "alert" : "status"}
                  className={
                    "auth-alert " +
                    (isError ? "error" : "success")
                  }
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : portal === "staff"
                  ? "Login as Secretary / Staff →"
                  : mode === "register"
                  ? "Register Patient Account →"
                  : "Login as Patient →"}
              </button>
            </form>

            {portal === "patient" && (
              <p className="auth-switch">
                {mode === "login"
                  ? "Don't have an account?"
                  : "Already have an account?"}{" "}

                <button
                  type="button"
                  onClick={() =>
                    changeMode(
                      mode === "login"
                        ? "register"
                        : "login"
                    )
                  }
                >
                  {mode === "login"
                    ? "Register"
                    : "Login"}
                </button>
              </p>
            )}

            <div className="auth-privacy">
              🔒{" "}
              {portal === "staff"
                ? "Staff accounts are created and authorized by the clinic administrator. Public staff registration is disabled."
                : "Patient authentication is securely managed through Supabase."}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
