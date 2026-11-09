
import { useEffect, useState } from "react";

interface AirQuality {
  us_aqi: number;
  pm2_5: number | null;
  pm10: number | null;
  time: string;
}

const latitude = Number(
  import.meta.env.VITE_CLINIC_LATITUDE || 8.228
);

const longitude = Number(
  import.meta.env.VITE_CLINIC_LONGITUDE || 124.245
);

function getAirQualityStatus(aqi: number) {
  if (aqi <= 50) {
    return {
      label: "Good",
      color: "#15803d",
      background: "#dcfce7",
      description: "Air quality is satisfactory.",
    };
  }

  if (aqi <= 100) {
    return {
      label: "Moderate",
      color: "#a16207",
      background: "#fef3c7",
      description: "Air quality is acceptable for most people.",
    };
  }

  if (aqi <= 150) {
    return {
      label: "Unhealthy for Sensitive Groups",
      color: "#c2410c",
      background: "#ffedd5",
      description:
        "Sensitive individuals should consider limiting prolonged outdoor activity.",
    };
  }

  if (aqi <= 200) {
    return {
      label: "Unhealthy",
      color: "#b91c1c",
      background: "#fee2e2",
      description:
        "Consider reducing prolonged outdoor activities.",
    };
  }

  return {
    label: aqi <= 300 ? "Very Unhealthy" : "Hazardous",
    color: "#7f1d1d",
    background: "#fecaca",
    description:
      "Air pollution is elevated. Follow local health guidance.",
  };
}

export default function AirQualityCard() {
  const [airQuality, setAirQuality] =
    useState<AirQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAirQuality(signal?: AbortSignal) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError("Invalid clinic coordinates.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "us_aqi,pm2_5,pm10",
        timezone: "Asia/Manila",
      });

      const response = await fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
        { signal }
      );

      if (!response.ok) {
        throw new Error("Air Quality API is unavailable.");
      }

      const result = await response.json();
      const current = result.current;

      if (!current || typeof current.us_aqi !== "number") {
        throw new Error("Air quality data is unavailable.");
      }

      if (signal?.aborted) return;

      setAirQuality({
        us_aqi: current.us_aqi,
        pm2_5:
          typeof current.pm2_5 === "number"
            ? current.pm2_5
            : null,
        pm10:
          typeof current.pm10 === "number"
            ? current.pm10
            : null,
        time: current.time || "",
      });
    } catch (err) {
      if (signal?.aborted) return;

      setError(
        err instanceof Error
          ? err.message
          : "Unable to retrieve air quality."
      );
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    void loadAirQuality(controller.signal);

    return () => controller.abort();
  }, []);

  const status = airQuality
    ? getAirQualityStatus(airQuality.us_aqi)
    : null;

  return (
    <div className="info-card">
      <div className="card-top">
        <h3>Air Quality Today</h3>
        <span className="api-badge">Air Quality API</span>
      </div>

      {loading && !airQuality ? (
        <p>Loading air quality...</p>
      ) : error && !airQuality ? (
        <p className="error">{error}</p>
      ) : airQuality && status ? (
        <div style={{ padding: "15px 5px" }}>
          <div
            style={{
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 42,
                marginBottom: 10,
              }}
            >
              🌿
            </div>

            <h2
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: "#0d9488",
              }}
            >
              {Math.round(airQuality.us_aqi)}
            </h2>

            <p
              style={{
                fontSize: 13,
                color: "#64748b",
                marginBottom: 12,
              }}
            >
              US Air Quality Index
            </p>

            <span
              style={{
                display: "inline-block",
                padding: "8px 16px",
                borderRadius: 999,
                background: status.background,
                color: status.color,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {status.label}
            </span>

            <p
              style={{
                fontSize: 13,
                color: "#64748b",
                marginTop: 15,
              }}
            >
              {status.description}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div
              style={{
                padding: 15,
                borderRadius: 12,
                background: "#f8fafc",
                textAlign: "center",
              }}
            >
              <p>PM2.5</p>
              <strong>
                {airQuality.pm2_5?.toFixed(1) ?? "N/A"}
              </strong>
              <p style={{ fontSize: 11 }}>µg/m³</p>
            </div>

            <div
              style={{
                padding: 15,
                borderRadius: 12,
                background: "#f8fafc",
                textAlign: "center",
              }}
            >
              <p>PM10</p>
              <strong>
                {airQuality.pm10?.toFixed(1) ?? "N/A"}
              </strong>
              <p style={{ fontSize: 11 }}>µg/m³</p>
            </div>
          </div>

          {error && (
            <p className="error" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}
        </div>
      ) : (
        <p>Air quality information is unavailable.</p>
      )}

      <button
        type="button"
        className="link-btn"
        onClick={() => void loadAirQuality()}
        disabled={loading}
      >
        {loading ? "Refreshing..." : "↻ Refresh Air Quality"}
      </button>
    </div>
  );
}
