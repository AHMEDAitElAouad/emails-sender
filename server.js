const express = require("express");
const { MongoClient } = require("mongodb");
const nodemailer = require("nodemailer");
const Bull = require("bull");
const cron = require("node-cron");
const fs = require("fs");
require("dotenv").config();

// Validate required environment variables
["MONGO_URI", "EMAIL_USER", "EMAIL_PASS", "APP_URL", "PORT"].forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Environment variable ${key} is missing.`);
  }
});

const app = express();
app.use(express.json());

let db;
const client = new MongoClient(process.env.MONGO_URI);

// Database Connection
async function connectToDb() {
  try {
    await client.connect();
    db = client.db("contactsDB");
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email Sending Function
async function sendEmail({ recipient, subject, body, emailKey, myEmail, originalBody, inReplyTo, references }) {
  const trackingPixelUrl = `${process.env.APP_URL}/track?email=${recipient}&emailKey=${emailKey}`;
  const replyBody = `${body}<br/><img src="${trackingPixelUrl}" style="display: none;">`;

  const mailOptions = {
    from: `"AHMED" <${myEmail}>`,
    to: recipient,
    subject: inReplyTo ? `Re: ${subject}` : subject,
    html: replyBody,
  };

  if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
  if (references) mailOptions.references = references;

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${recipient}: ${info.messageId}`);
    return info.messageId;
  } catch (error) {
    console.error("Error sending email:", error);
    return null;
  }
}

// Job Queue for Emails
const emailQueue = new Bull("emailQueue");

// Process Email Queue
emailQueue.process(async (job) => {
  const { recipient, subject, body, emailKey, myEmail, originalBody, inReplyTo, references } = job.data;

  const sentAt = new Date();
  const messageId = await sendEmail({
    recipient,
    subject,
    body,
    emailKey,
    myEmail,
    originalBody,
    inReplyTo,
    references,
  });

  if (messageId) {
    await db.collection("email_sequences").updateOne(
      { email: recipient, [`sequence.${emailKey}`]: { $exists: true } },
      {
        $set: {
          [`sequence.${emailKey}.sent`]: true,
          [`sequence.${emailKey}.messageId`]: messageId,
          [`sequence.${emailKey}.sentAt`]: sentAt,
        },
      }
    );
  }
});

// Schedule Cron Job
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const currentDay = now.toLocaleString("en-US", { weekday: "long" });
  const currentHour = `${now.getHours().toString().padStart(2, "0")}:00`;

  try {
    const prospects = await db.collection("email_sequences").find().toArray();

    for (const prospect of prospects) {
      const { email, sequence, my_email } = prospect;

      const emailsToSend = Object.entries(sequence).filter(
        ([, emailData]) =>
          emailData.time &&
          emailData.time.day === currentDay &&
          emailData.time.hour === currentHour &&
          !emailData.sent
      );

      for (const [emailKey, emailData] of emailsToSend) {
        emailQueue.add({
          recipient: email,
          subject: emailData.subject,
          body: emailData.body,
          emailKey,
          myEmail: my_email,
          originalBody: emailData.originalBody,
          inReplyTo: emailData.inReplyTo,
          references: emailData.references,
        });
      }
    }
  } catch (error) {
    console.error("Error in cron job:", error);
  }
});

// Email Tracking Pixel Endpoint
app.get("/track", async (req, res) => {
  const { email, emailKey } = req.query;

  const logEntry = {
    email: email || "unknown",
    emailKey: emailKey || "unknown",
    timestamp: new Date().toISOString(),
  };
  console.log("Tracking:", logEntry);

  if (email && emailKey) {
    await db.collection("email_sequences").updateOne(
      { email, [`sequence.${emailKey}`]: { $exists: true } },
      { $set: { [`sequence.${emailKey}.opened`]: true } }
    );
  }

  fs.appendFileSync("tracking_logs.json", JSON.stringify(logEntry) + "\n");

  res.set("Content-Type", "image/png");
  res.send(
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0xf8, 0x0f, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0x57, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ])
  );
});

// Start Server
const PORT = process.env.PORT || 80;
app.listen(PORT, async () => {
  await connectToDb();
  console.log(`Server running on port ${PORT}`);
});
