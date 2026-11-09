
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "./supabase";
import { createAppointmentPdf } from "./appointmentPdf";
import AirQualityCard from "./AirQualityCard";
import "./index.css";

type Page = "dashboard" | "appointment" | "holidays" | "location";
type AppointmentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed";

interface Weather {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  weather_code: number;
}

interface Holiday {
  date: string;
  name: string;
  localName: string;
  global: boolean;
}

interface AppointmentRow {
  id: string;
  patient_id: string;
  reference: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
}

interface Booking {
  reference: string;
  patientName: string;
  service: string;
  date: string;
  time: string;
  pdfUrl: string;
}

interface PhilippineTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  seconds: number;
  dayOfWeek: string;
  timeZone: string;
  dateTime: string;
}

const services = [
  { name: "Dental Consultation", icon: "🩺" },
  { name: "Oral Prophylaxis", icon: "✨" },
  { name: "Tooth Extraction", icon: "🦷" },
  { name: "Dental Filling", icon: "💠" },
  { name: "Braces Consultation", icon: "😁" },
  { name: "Teeth Whitening", icon: "🌟" },
];

const clinicQuery =
  import.meta.env.VITE_CLINIC_MAP_QUERY ||
  "Cempron Dental Clinic, Philippines";

const latitude = Number(
  import.meta.env.VITE_CLINIC_LATITUDE || 8.228
);

const longitude = Number(
  import.meta.env.VITE_CLINIC_LONGITUDE || 124.245
);

function todayPH() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(
    "en-PH",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
}

function weatherDescription(code: number) {
  if (code === 0) return "Clear Sky";
  if ([1, 2, 3].includes(code)) return "Partly Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code))
    return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code))
    return "Rainy";
  if ([80, 81, 82].includes(code))
    return "Rain Showers";
  if ([95, 96, 99].includes(code))
    return "Thunderstorms";
  return "Variable Weather";
}

function weatherIcon(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2, 3].includes(code)) return "⛅";
  if ([95, 96, 99].includes(code)) return "⛈️";
  if (code >= 51 && code <= 82) return "🌧️";
  return "🌤️";
}

function formatPhilippineTime(data: PhilippineTime) {
  const hour = data.hour % 12 || 12;
  const minute = String(data.minute).padStart(2, "0");
  return `${hour}:${minute} ${data.hour >= 12 ? "PM" : "AM"}`;
}

function formatPhilippineDate(data: PhilippineTime) {
  const month = new Intl.DateTimeFormat("en-PH", {
    month: "long",
    timeZone: "UTC",
  }).format(
    new Date(Date.UTC(data.year, data.month - 1, data.day))
  );

  return `${data.dayOfWeek}, ${month} ${data.day}, ${data.year}`;
}

function generateQrUrl(pdfUrl: string, size = "240x240") {
  return (
    "https://api.qrserver.com/v1/create-qr-code/?" +
    new URLSearchParams({
      size,
      format: "png",
      data: pdfUrl,
    }).toString()
  );
}

function App() {
  const [page, setPage] = useState<Page>("dashboard");

  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayLoading, setHolidayLoading] = useState(true);
  const [holidayError, setHolidayError] = useState("");

  const [philippineTime, setPhilippineTime] =
    useState<PhilippineTime | null>(null);
  const [timeLoading, setTimeLoading] = useState(true);
  const [timeError, setTimeError] = useState("");

  const [patientName, setPatientName] = useState("");
  const [email, setEmail] = useState("");
  const [service, setService] = useState(services[0].name);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [booking, setBooking] = useState<Booking | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [myRequests, setMyRequests] =
    useState<AppointmentRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");

  const [historyPdfUrls, setHistoryPdfUrls] =
    useState<Record<string, string>>({});

  const [generatingPdfId, setGeneratingPdfId] =
    useState<string | null>(null);

  const pdfGenerationLock = useRef(false);

  async function loadWeather() {
    setWeatherLoading(true);
    setWeatherError("");

    //diri display ang current weather conditions
    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current:
          "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
        timezone: "Asia/Manila",
      });

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params}`
      );

      if (!response.ok) {
        throw new Error("Weather API unavailable.");
      }

      const result = await response.json();

      if (!result.current) {
        throw new Error("Weather data missing.");
      }

      setWeather(result.current as Weather);
    } catch (error) {
      setWeatherError(
        error instanceof Error
          ? error.message
          : "Weather request failed."
      );
    } finally {
      setWeatherLoading(false);
    }
  }

  async function loadHolidays() {
    setHolidayLoading(true);
    setHolidayError("");

    try {
      const year = Number(todayPH().slice(0, 4));
      // diri maretrieve ang ang philippine holidays
      const responses = await Promise.all(
        [year, year + 1].map((y) =>
          fetch(
            `https://date.nager.at/api/v3/PublicHolidays/${y}/PH`
          )
        )
      );

      if (responses.some((response) => !response.ok)) {
        throw new Error("Holiday API unavailable.");
      }

      const results: Holiday[][] = await Promise.all(
        responses.map((response) => response.json())
      );

      setHolidays(
        results.flat().sort((a, b) =>
          a.date.localeCompare(b.date)
        )
      );
    } catch (error) {
      setHolidayError(
        error instanceof Error
          ? error.message
          : "Holiday request failed."
      );
    } finally {
      setHolidayLoading(false);
    }
  }

  //to retreive and display ang current ph date and time
  async function loadPhilippineTime() {
    setTimeLoading(true);
    setTimeError("");

    try {
      const response = await fetch(
        "https://timeapi.io/api/time/current/zone?timeZone=Asia%2FManila",
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Time API unavailable.");
      }

      const data: PhilippineTime = await response.json();

      if (
        typeof data.year !== "number" ||
        typeof data.month !== "number" ||
        typeof data.day !== "number" ||
        typeof data.hour !== "number" ||
        typeof data.minute !== "number" ||
        typeof data.dayOfWeek !== "string"
      ) {
        throw new Error("Invalid time response.");
      }

      setPhilippineTime(data);
    } catch (error) {
      setTimeError(
        error instanceof Error
          ? error.message
          : "Philippine time unavailable."
      );
    } finally {
      setTimeLoading(false);
    }
  }
  //email verification
  async function loadMyRequests() {
    if (!supabase) {
      setRequestsError("Supabase is not configured.");
      setRequestsLoading(false);
      return;
    }

    setRequestsLoading(true);
    setRequestsError("");

    try {
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError || !auth.user) {
        throw new Error(
          "Please log in to view your appointments."
        );
      }
      //retrieve ang appointment 
      const { data, error } = await supabase
        .from("dental_appointments")
        .select(
          "id,patient_id,reference,service,appointment_date,appointment_time,status"
        )
        .eq("patient_id", auth.user.id)
        .order("appointment_date", {
          ascending: false,
        });

      if (error) throw error;

      setMyRequests((data || []) as AppointmentRow[]);
    } catch (error) {
      setRequestsError(
        error instanceof Error
          ? error.message
          : "Unable to load appointments."
      );
    } finally {
      setRequestsLoading(false);
    }
  }

  async function prepareHistoryPdf(
    request: AppointmentRow
  ) {
    if (pdfGenerationLock.current) return;

    pdfGenerationLock.current = true;
    setGeneratingPdfId(request.id);

    try {
      const pdfUrl = await createAppointmentPdf(
        request.reference,
        request.patient_id
      );

      setHistoryPdfUrls((previous) => ({
        ...previous,
        [request.id]: pdfUrl,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to generate the appointment PDF.";

      window.alert(
        `Appointment reference PDF error:\n${message}`
      );
    } finally {
      setGeneratingPdfId(null);
      pdfGenerationLock.current = false;
    }
  }

  useEffect(() => {
    void loadWeather();
    void loadHolidays();
    void loadPhilippineTime();

    const timeInterval = window.setInterval(() => {
      void loadPhilippineTime();
    }, 60000);

    return () => {
      window.clearInterval(timeInterval);
    };
  }, []);

  useEffect(() => {
    if (page !== "appointment") return;

    void loadMyRequests();

    const interval = window.setInterval(() => {
      void loadMyRequests();
    }, 10000);

    const onFocus = () => {
      void loadMyRequests();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [page]);

  async function submitAppointment(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving) return;

    setBooking(null);
    setFormMessage("");
    setFormError(false);

    if (!supabase) {
      setFormMessage("Supabase is not configured.");
      setFormError(true);
      return;
    }

    if (
      !patientName.trim() ||
      !email.trim() ||
      !date ||
      !time
    ) {
      setFormMessage("Please complete all fields.");
      setFormError(true);
      return;
    }

    if (date < todayPH()) {
      setFormMessage(
        "Choose today or a future appointment date."
      );
      setFormError(true);
      return;
    }

    if (holidayLoading || holidayError) {
      setFormMessage(
        "Holiday checking is unavailable. Try again."
      );
      setFormError(true);
      return;
    }

    //dri mahibal.an if mo book ang patient sa holiday mo pop up ang message
    const holiday = holidays.find(
      (item) => item.date === date
    );

    if (holiday) {
      setFormMessage(
        `${holiday.name} is a public holiday. Select another date.`
      );
      setFormError(true);
      return;
    }

    setSaving(true);

    let appointmentSaved = false;

    try {
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError || !auth.user) {
        throw new Error("Please log in again.");
      }

      const reference = `CDC-${crypto.randomUUID()}`;
      //save ang appointment 
      const { error } = await supabase
        .from("dental_appointments")
        .insert({
          patient_id: auth.user.id,
          patient_name: patientName.trim(),
          patient_email: auth.user.email || email.trim(),
          reference,
          service,
          appointment_date: date,
          appointment_time: time,
          status: "pending",
        });

      if (error) throw error;

      appointmentSaved = true;

      const pdfUrl = await createAppointmentPdf(
        reference,
        auth.user.id
      );

      setBooking({
        reference,
        patientName: patientName.trim(),
        service,
        date,
        time,
        pdfUrl,
      });

      setFormMessage(
        "Appointment saved! Scan the QR code to open your reference PDF."
      );

      await loadMyRequests();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error.";

      setFormError(true);

      if (appointmentSaved) {
        setFormMessage(
          "Your appointment was saved, but the PDF could not be prepared: " +
          message +
          " Go to My Appointment Requests and click Generate PDF QR. Do not submit another booking for the same appointment."
        );

        await loadMyRequests();
      } else {
        setFormMessage(
          `Could not save appointment: ${message}`
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const qrUrl = booking
    ? generateQrUrl(booking.pdfUrl)
    : "";

  // to display the dental clinic location
  const directionsUrl =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(clinicQuery);

  const mapUrl =
    `https://www.google.com/maps?q=${encodeURIComponent(
      clinicQuery
    )}&output=embed`;

  const upcomingHolidays = holidays.filter(
    (holiday) => holiday.date >= todayPH()
  );

  function navigate(destination: Page) {
    setPage(destination);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  return (
    <div className="app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">🦷</div>
          <div>
            <h2>CEMPRON</h2>
            <span>Dental Clinic</span>
          </div>
        </div>

        <p className="sidebar-label">
          MAIN MENU
        </p>

        <nav className="navigation">
          <button
            className={
              page === "dashboard" ? "nav active" : "nav"
            }
            onClick={() => navigate("dashboard")}
          >
            <span>▦</span> Dashboard
          </button>

          <button
            className={
              page === "appointment" ? "nav active" : "nav"
            }
            onClick={() => navigate("appointment")}
          >
            <span>📅</span> Appointments
          </button>

          <button
            className={
              page === "holidays" ? "nav active" : "nav"
            }
            onClick={() => navigate("holidays")}
          >
            <span>🗓️</span> Public Holidays
          </button>

          <button
            className={
              page === "location" ? "nav active" : "nav"
            }
            onClick={() => navigate("location")}
          >
            <span>📍</span> Clinic Location
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span>🦷</span>
            <h3>Keep Smiling!</h3>
            <p>Your smile is our priority.</p>
          </div>
          <small>© Cempron Dental Clinic</small>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="main-area">
        <header className="topbar">
          <div>
            <h2>
              {page === "dashboard" && "Dashboard"}
              {page === "appointment" && "Appointments"}
              {page === "holidays" && "Public Holidays"}
              {page === "location" && "Clinic Location"}
            </h2>

            <p>
              Welcome to the Cempron Dental Clinic Portal
            </p>
          </div>

          <div className="topbar-right">
            <span className="online-dot" />
            API Services Connected
          </div>
        </header>

        <main className="content">
          {/* ==================================
              DASHBOARD
             ================================== */}

          {page === "dashboard" && (
            <>
              <section className="welcome-banner">
                <div>
                  <span className="welcome-tag">
                    YOUR SMILE MATTERS
                  </span>

                  <h1>
                    Welcome to
                    <br />
                    Cempron Dental Clinic
                  </h1>

                  <p>
                    Quality dental care begins with a
                    beautiful, healthy smile.
                  </p>

                  <button
                    className="primary-btn"
                    onClick={() => navigate("appointment")}
                  >
                    Book an Appointment →
                  </button>
                </div>

                <div className="banner-tooth">
                  🦷
                </div>
              </section>

              <div className="section-title">
                <div>
                  <h2>Clinic Overview</h2>
                  <p>Live information and clinic services</p>
                </div>
              </div>

              <div className="cards-grid">
                <AirQualityCard />
                {/* API 1: WEATHER */}
                <div className="info-card weather-card">
                  <div className="card-top">
                    <h3>Weather Today</h3>
                    <span className="api-badge">
                      Open-Meteo API
                    </span>
                  </div>

                  {weatherLoading ? (
                    <p>Loading weather...</p>
                  ) : weatherError ? (
                    <p className="error">{weatherError}</p>
                  ) : weather ? (
                    <>
                      <div className="weather-main">
                        <span className="weather-emoji">
                          {weatherIcon(weather.weather_code)}
                        </span>

                        <div>
                          <strong className="temperature">
                            {weather.temperature_2m}°C
                          </strong>
                          <p>
                            {weatherDescription(
                              weather.weather_code
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="weather-details">
                        <div>
                          <span>Humidity</span>
                          <strong>
                            {weather.relative_humidity_2m}%
                          </strong>
                        </div>
                        <div>
                          <span>Feels Like</span>
                          <strong>
                            {weather.apparent_temperature}°C
                          </strong>
                        </div>
                        <div>
                          <span>Wind Speed</span>
                          <strong>
                            {weather.wind_speed_10m} km/h
                          </strong>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p>Weather unavailable.</p>
                  )}

                  <button
                    className="link-btn"
                    onClick={() => void loadWeather()}
                  >
                    ↻ Refresh Weather
                  </button>
                </div>

                {/* API 2: HOLIDAYS */}
                <div className="info-card">
                  <div className="card-top">
                    <h3>Upcoming Holidays</h3>
                    <span className="api-badge">
                      Holiday API
                    </span>
                  </div>

                  {holidayLoading ? (
                    <p>Loading holidays...</p>
                  ) : holidayError ? (
                    <p className="error">{holidayError}</p>
                  ) : (
                    <div className="mini-holidays">
                      {upcomingHolidays.slice(0, 3).map(
                        (holiday) => (
                          <div
                            className="mini-holiday"
                            key={`${holiday.date}-${holiday.name}`}
                          >
                            <div className="holiday-icon">
                              📅
                            </div>
                            <div>
                              <strong>{holiday.name}</strong>
                              <p>{formatDate(holiday.date)}</p>
                            </div>
                          </div>
                        )
                      )}

                      {upcomingHolidays.length === 0 && (
                        <p>No upcoming holidays found.</p>
                      )}
                    </div>
                  )}

                  <button
                    className="link-btn"
                    onClick={() => navigate("holidays")}
                  >
                    View All Holidays →
                  </button>
                </div>

                {/* API 3: QUICK APPOINTMENT */}
                <div className="info-card">
                  <div className="card-top">
                    <h3>Quick Appointment</h3>
                    <span className="api-badge">
                      QR Code API
                    </span>
                  </div>

                  <div className="quick-appointment">
                    <div className="quick-icon">🔳</div>
                    <h3>Easy Appointment Request</h3>
                    <p>
                      Generate a PDF QR reference for
                      your preferred dental visit.
                    </p>
                    <button
                      className="primary-btn"
                      onClick={() => navigate("appointment")}
                    >
                      Schedule Now →
                    </button>
                  </div>
                </div>

                {/* API 4: GOOGLE MAPS */}
                <div className="info-card">
                  <div className="card-top">
                    <h3>Find Our Clinic</h3>
                    <span className="api-badge">
                      Google Maps
                    </span>
                  </div>

                  <div className="quick-appointment">
                    <div className="quick-icon">📍</div>
                    <h3>Visit Cempron Dental Clinic</h3>
                    <p>
                      Find our location and get directions.
                    </p>
                    <button
                      className="secondary-btn"
                      onClick={() => navigate("location")}
                    >
                      View Location →
                    </button>
                  </div>
                </div>

                {/* API 5: TIMEAPI.IO */}
                <div className="info-card">
                  <div className="card-top">
                    <h3>Philippine Date & Time</h3>
                    <span className="api-badge">
                      TimeAPI.io
                    </span>
                  </div>

                  <div
                    style={{
                      padding: "20px 5px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "42px",
                        marginBottom: "10px",
                      }}
                    >
                      🕒
                    </div>

                    {timeLoading && !philippineTime ? (
                      <p>Loading Philippine time...</p>
                    ) : philippineTime ? (
                      <>
                        <h2
                          style={{
                            fontSize: "30px",
                            fontWeight: 800,
                            color: "#0d9488",
                            marginBottom: "8px",
                          }}
                        >
                          {formatPhilippineTime(
                            philippineTime
                          )}
                        </h2>

                        <p
                          style={{
                            fontSize: "15px",
                            fontWeight: 600,
                            marginBottom: "8px",
                          }}
                        >
                          {formatPhilippineDate(
                            philippineTime
                          )}
                        </p>

                        <p
                          style={{
                            color: "#64748b",
                            fontSize: "13px",
                          }}
                        >
                          Philippine Standard Time (UTC+8)
                        </p>
                      </>
                    ) : (
                      <p className="error">
                        {timeError || "Time unavailable."}
                      </p>
                    )}

                    {timeError && philippineTime && (
                      <p className="error">
                        Unable to refresh. Showing the
                        last retrieved time.
                      </p>
                    )}

                    <button
                      className="link-btn"
                      style={{ marginTop: "15px" }}
                      onClick={() => void loadPhilippineTime()}
                      disabled={timeLoading}
                    >
                      ↻ Refresh Time
                    </button>
                  </div>
                </div>
              </div>

              {/* DENTAL SERVICES */}
              <div className="section-title">
                <div>
                  <h2>Our Dental Services</h2>
                  <p>Dental services available for inquiry</p>
                </div>
              </div>

              <div className="services-grid">
                {services.map((item) => (
                  <div
                    className="service-card"
                    key={item.name}
                  >
                    <span>{item.icon}</span>
                    <h3>{item.name}</h3>

                    <button
                      onClick={() => {
                        setService(item.name);
                        navigate("appointment");
                      }}
                    >
                      Request Service →
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ==================================
              APPOINTMENTS
             ================================== */}

          {page === "appointment" && (
            <>
              <div className="page-heading">
                <h1>Dental Appointment</h1>
                <p>
                  Request an appointment and track
                  its status while the secretary reviews it.
                </p>
              </div>

              <div className="appointment-layout">
                {/* APPOINTMENT FORM */}
                <section className="info-card">
                  <div className="card-top">
                    <h3>Appointment Form</h3>
                    <span className="api-badge">
                      Booking Request
                    </span>
                  </div>

                  <form
                    className="appointment-form"
                    onSubmit={submitAppointment}
                  >
                    <label>
                      Full Name
                      <input
                        value={patientName}
                        onChange={(event) =>
                          setPatientName(event.target.value)
                        }
                        placeholder="Enter your full name"
                        maxLength={100}
                        required
                      />
                    </label>

                    <label>
                      Email Address
                      <input
                        type="email"
                        value={email}
                        onChange={(event) =>
                          setEmail(event.target.value)
                        }
                        placeholder="example@gmail.com"
                        required
                      />
                    </label>

                    <label>
                      Dental Service
                      <select
                        value={service}
                        onChange={(event) =>
                          setService(event.target.value)
                        }
                      >
                        {services.map((item) => (
                          <option
                            key={item.name}
                            value={item.name}
                          >
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="form-row">
                      <label>
                        Preferred Date
                        <input
                          type="date"
                          value={date}
                          min={todayPH()}
                          onChange={(event) =>
                            setDate(event.target.value)
                          }
                          required
                        />
                      </label>

                      <label>
                        Preferred Time
                        <input
                          type="time"
                          value={time}
                          onChange={(event) =>
                            setTime(event.target.value)
                          }
                          required
                        />
                      </label>
                    </div>

                    {date &&
                      holidays.some(
                        (holiday) => holiday.date === date
                      ) && (
                        <div className="warning">
                          ⚠️ This date is a public holiday.
                          Select another appointment date.
                        </div>
                      )}

                    {formMessage && (
                      <div
                        role={formError ? "alert" : "status"}
                        className={
                          formError ? "warning" : "success"
                        }
                      >
                        {formMessage}
                      </div>
                    )}

                    <button
                      className="primary-btn full"
                      type="submit"
                      disabled={
                        saving ||
                        holidayLoading ||
                        Boolean(holidayError)
                      }
                    >
                      {saving
                        ? "Saving Appointment..."
                        : "Submit Appointment & Generate QR"}
                    </button>
                  </form>
                </section>

                {/* APPOINTMENT PDF QR CODE */}
                <section className="info-card qr-card">
                  <div className="card-top">
                    <h3>Appointment QR Code</h3>
                    <span className="api-badge">
                      QRServer API
                    </span>
                  </div>

                  {booking ? (
                    <div className="qr-result">
                      <div className="qr-frame">
                        <img
                          src={qrUrl}
                          alt={`PDF QR for ${booking.reference}`}
                          width={240}
                          height={240}
                        />
                      </div>

                      <h2>Request Submitted!</h2>

                      <p>{booking.patientName}</p>
                      <p>{booking.service}</p>
                      <p>{formatDate(booking.date)}</p>
                      <p>{booking.time}</p>

                      <div className="reference-box">
                        {booking.reference}
                      </div>

                      <div className="warning">
                        Scan this QR code to open your
                        appointment reference PDF.
                        The appointment is still subject
                        to clinic approval.
                      </div>

                      <a
                        href={booking.pdfUrl}
                        className="secondary-btn"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Reference PDF
                      </a>

                      <a
                        href={qrUrl}
                        className="link-btn"
                        target="_blank"
                        rel="noreferrer"
                        style={{ marginTop: 12 }}
                      >
                        View QR Image
                      </a>
                    </div>
                  ) : (
                    <div className="qr-empty">
                      <div>▦</div>
                      <h3>No QR Code Yet</h3>
                      <p>
                        Submit your appointment to generate
                        a PDF reference and QR code.
                      </p>
                    </div>
                  )}
                </section>
              </div>

              {/* SAVED APPOINTMENTS */}
              <div className="section-title">
                <div>
                  <h2>My Appointment Requests</h2>
                  <p>
                    Check appointment statuses and
                    generate PDF QR codes.
                  </p>
                </div>

                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => void loadMyRequests()}
                  disabled={requestsLoading}
                >
                  ↻ Refresh Status
                </button>
              </div>

              <section className="info-card">
                {requestsError && (
                  <p className="error" role="alert">
                    {requestsError}
                  </p>
                )}

                {requestsLoading && myRequests.length === 0 ? (
                  <p>Loading appointment requests...</p>
                ) : myRequests.length === 0 ? (
                  <div className="qr-empty">
                    <div>📅</div>
                    <h3>No Appointments Yet</h3>
                    <p>
                      Your submitted appointments will
                      appear here after they are saved.
                    </p>
                  </div>
                ) : (
                  <div className="holiday-table-wrap">
                    <table className="holiday-table">
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Reference</th>
                          <th>Status</th>
                          <th>PDF QR Code</th>
                        </tr>
                      </thead>

                      <tbody>
                        {myRequests.map((request) => {
                          const pdfUrl =
                            historyPdfUrls[request.id];

                          return (
                            <tr key={request.id}>
                              <td>{request.service}</td>

                              <td>
                                {formatDate(
                                  request.appointment_date
                                )}
                              </td>

                              <td>
                                {request.appointment_time.slice(
                                  0,
                                  5
                                )}
                              </td>

                              <td>{request.reference}</td>
                              <td>
                                <span
                                  className={`table-badge appointment-status ${request.status}`}
                                >
                                  {request.status}
                                </span>
                              </td>
                              <td>
                                {pdfUrl ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      gap: 10,
                                      minWidth: 135,
                                    }}
                                  >
                                    <img
                                      src={generateQrUrl(
                                        pdfUrl,
                                        "200x200"
                                      )}
                                      alt={`PDF QR code ${request.reference}`}
                                      width={120}
                                      height={120}
                                      style={{
                                        borderRadius: 8,
                                        border: "1px solid #e2e8f0",
                                        padding: 5,
                                      }}
                                    />

                                    <a
                                      className="link-btn"
                                      href={pdfUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Open PDF
                                    </a>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="link-btn"
                                    disabled={
                                      generatingPdfId !== null
                                    }
                                    onClick={() =>
                                      void prepareHistoryPdf(
                                        request
                                      )
                                    }
                                  >
                                    {generatingPdfId === request.id
                                      ? "Preparing PDF..."
                                      : "Generate PDF QR"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="note">
                  Pending means the clinic received your
                  request but has not approved it.
                  Approved means the secretary accepted
                  the request. A generated QR code opens
                  the appointment reference PDF, not an
                  approval certificate.
                </p>
              </section>
            </>
          )}

          {/* ==================================
              PUBLIC HOLIDAYS
             ================================== */}

          {page === "holidays" && (
            <>
              <div className="page-heading">
                <h1>Philippine Public Holidays</h1>
                <p>
                  Check upcoming holidays before choosing
                  an appointment date.
                </p>
              </div>

              <section className="info-card">
                <div className="card-top">
                  <h3>Upcoming Public Holidays</h3>
                  <span className="api-badge">
                    Nager.Date API
                  </span>
                </div>

                {holidayLoading ? (
                  <p>Loading holidays...</p>
                ) : holidayError ? (
                  <p className="error">{holidayError}</p>
                ) : (
                  <div className="holiday-table-wrap">
                    <table className="holiday-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Holiday</th>
                          <th>Coverage</th>
                        </tr>
                      </thead>

                      <tbody>
                        {upcomingHolidays.map((holiday) => (
                          <tr
                            key={`${holiday.date}-${holiday.name}`}
                          >
                            <td>
                              {formatDate(holiday.date)}
                            </td>

                            <td>{holiday.name}</td>

                            <td>
                              <span className="table-badge">
                                {holiday.global
                                  ? "National"
                                  : "Regional"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="note">
                  Holiday data may not include all
                  locally declared holidays. Clinic
                  closures should be confirmed directly.
                </p>
              </section>
            </>
          )}

          {/* ==================================
              CLINIC LOCATION
             ================================== */}

          {page === "location" && (
            <>
              <div className="page-heading">
                <h1>Find Our Dental Clinic</h1>
                <p>
                  Use Google Maps to locate
                  Cempron Dental Clinic.
                </p>
              </div>

              <section className="info-card">
                <div className="card-top">
                  <h3>📍 Cempron Dental Clinic</h3>
                  <span className="api-badge">
                    Google Maps
                  </span>
                </div>
                
                <div className="map-container">
                  <iframe
                    title="Cempron Dental Clinic Location"
                    src={mapUrl}
                    width="100%"
                    height="450"
                    style={{
                      border: 0,
                      borderRadius: "14px",
                    }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>

                <div className="location-footer">
                  <div>
                    <h3>Cempron Dental Clinic</h3>
                    <p>
                      Please verify the exact clinic location
                      before using the displayed directions.
                    </p>
                  </div>

                  <a
                    href={directionsUrl}
                    className="primary-btn"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Maps →
                  </a>
                </div>
              </section>
            </>
          )}
        </main>

        <footer className="footer">
          <p>
            © {new Date().getFullYear()} Cempron Dental Clinic.
            Academic API Integration Demo.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
