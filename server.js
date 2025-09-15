import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";

// Map a clientKey to an ENV prefix. Add one line per client.
const CLIENT_PREFIX = {
  "demo-salon": "SALON",
  "demo-dentist": "DENTIST"
};

const app = express();
app.use(bodyParser.json());

function getOAuth2ForClient(clientKey) {
  const prefix = CLIENT_PREFIX[clientKey];
  if (!prefix) throw new Error(`Unknown clientKey: ${clientKey}`);

  const GOOGLE_CLIENT_ID = process.env[`${prefix}_GOOGLE_CLIENT_ID`];
  const GOOGLE_CLIENT_SECRET = process.env[`${prefix}_GOOGLE_CLIENT_SECRET`];
  const GOOGLE_REFRESH_TOKEN = process.env[`${prefix}_GOOGLE_REFRESH_TOKEN`];

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(`Missing env vars for clientKey: ${clientKey} (prefix ${prefix})`);
  }
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "google-calendar-mcp", clients: Object.keys(CLIENT_PREFIX) });
});

// Multi‑tenant scheduling endpoint
app.post("/schedule", async (req, res) => {
  try {
    const {
      clientKey, // REQUIRED: which business
      summary = "Appointment",
      description = "",
      startTime,
      endTime,
      timeZone = "America/New_York",
      calendarId = "primary",
      attendees = []
    } = req.body || {};

    if (!clientKey) return res.status(400).json({ error: "Missing clientKey" });
    if (!startTime || !endTime) return res.status(400).json({ error: "startTime and endTime are required ISO strings" });

    const auth = getOAuth2ForClient(clientKey);
    const calendar = google.calendar({ version: "v3", auth });

    const event = {
      summary,
      description,
      start: { dateTime: startTime, timeZone },
      end: { dateTime: endTime, timeZone },
      attendees
    };

    const { data } = await calendar.events.insert({
      calendarId,
      resource: event,
      conferenceDataVersion: 1
    });

    res.json({ status: "success", eventId: data.id, htmlLink: data.htmlLink });
  } catch (error) {
    console.error("Schedule error:", error?.message || error);
    res.status(500).json({ status: "error", message: error?.message || "Unknown error" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Multi‑client MCP on :${PORT}`));
