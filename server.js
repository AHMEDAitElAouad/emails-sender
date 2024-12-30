const express = require("express");
const { MongoClient } = require("mongodb");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
require("dotenv").config();
const fs = require('fs');


const app = express();
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectToDb() {
    try {
        await client.connect();
        db = client.db("contactsDB"); // Replace with your DB name
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1);
    }
}


async function sendEmail(recipient, subject, body, inReplyTo = null, references = null, originalBody = null, emailKey, my_email, id) {
    let transporter;
    if(my_email=== "ahmed@alcaotar.com" || my_email=== "ahmed.ait.el.aouad@alcaotar.com" || my_email=== "ahmed.aitelaouad@alcaotar.com" ){
    transporter = nodemailer.createTransport({
        host: "smtp.zoho.com",
        port: 465,
        secure: true, // use SSL
        auth: {
            user: process.env.EMAIL_USER1,
            pass: process.env.EMAIL_PASS1,
        },
    });} else if(my_email=== "ahmed@alcaotar.agency" || my_email=== "ahmed.ait.el.aouad@alcaotar.agency" || my_email=== "ahmed.aitelaouad@alcaotar.agency"){
        transporter = nodemailer.createTransport({
            host: "smtp.zoho.com",
            port: 465,
            secure: true, // use SSL
            auth: {
                user: process.env.EMAIL_USER2,
                pass: process.env.EMAIL_PASS2,
            },
        });
    }
  const trackingPixelUrl = `${process.env.APP_URL}/track?email=${recipient}&emailKey=${emailKey}&id=${id}`;
  const replyBody = inReplyTo
      ? `${body}<br/><br/><hr style="border:none;border-top:1px solid #ccc"/><p> --- On ${new Date().toLocaleString()}, AHMED <${my_email}> wrote ---<br/>${originalBody}<br/></p><img src="${trackingPixelUrl}" style="display: none;">`
      : `${body}<br/><img src="${trackingPixelUrl}" style="display: none;">`;

  const mailOptions = {
      from: `"AHMED" <${my_email}>`,
      to: recipient,
      subject: inReplyTo ? `Re: ${subject}` : subject,
      html: replyBody,
      inReplyTo, // Ensure inReplyTo is set
      references, // Ensure references is set
  };

  try {
      const info = await transporter.sendMail(mailOptions);
      
      console.log(`Email sent to ${recipient}: ${info.messageId}`);
      return info.messageId;
  } catch (error) {
      console.error("Error sending email:", error);
      return null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MAX_EMAILS_PER_HOUR = 10;
const DELAY_BETWEEN_EMAILS = 90000; // 90 seconds (in milliseconds)

cron.schedule("0 * * * *", async () => {
  const now = new Date();
  const currentDay = now.toLocaleString("en-US", { weekday: "long" });
  const currentHour = now.toTimeString().split(":")[0] + ":00";
  console.log(currentDay, currentHour);

  try {
      const prospects = await db.collection("email_sequences").find().toArray();

      // Group prospects by email address
      const prospectsByEmail = prospects.reduce((acc, prospect) => {
          const { email, sequence, my_email, _id } = prospect;
          acc[my_email] = acc[my_email] || { my_email, sequences: [] };
          acc[my_email].sequences.push({ sequence, email, _id }); 
          return acc;
      }, {});
      
      // Process emails for each my_email address
      for (const { my_email, sequences } of Object.values(prospectsByEmail)) {
          let emailsToSendThisHour = [];
          // Find emails scheduled for the current hour for this my_email
          for (const { sequence, email, _id } of sequences) {
            const emails = Object.entries(sequence)
                .filter(([key, emailData]) => {
                    if (!emailData.time || !emailData.time.day || !emailData.time.hour) {
                        console.warn(`Invalid time data for email ${key} in prospect ${email}`);
                        return false;
                    }
                    return (
                        emailData.time.day === currentDay &&
                        emailData.time.hour === currentHour &&
                        !emailData.sent
                    );
                })
                .map(([key, emailData]) => ({
                    key,              // Include the sequence key
                    emailData,        // Include the email data
                    email,            // Include the email from the parent loop
                    _id
                }))
                .sort((a, b) => a.key.localeCompare(b.key));
        
            emailsToSendThisHour.push(...emails);
        }
        
          

          // Limit emails to MAX_EMAILS_PER_HOUR per my_email
          if (emailsToSendThisHour.length > MAX_EMAILS_PER_HOUR) {
              const allEmails = emailsToSendThisHour;
              emailsToSendThisHour = emailsToSendThisHour.slice(0, MAX_EMAILS_PER_HOUR);
              // Shift remaining emails to the next hour for this my_email
              const nextHour = (parseInt(currentHour.split(":")[0]) + 1) % 24 + ":00";
              
              for (let i = MAX_EMAILS_PER_HOUR; i < allEmails.length; i++) {
                
                  await db.collection("email_sequences").updateOne(
                    { "_id": allEmails[i]._id },  // Filter to find the correct email
                    { $set: { [`sequence.${allEmails[i].key}.time.hour`]: nextHour } } // Update the hour field
                );
              }
          }

          // Send emails with delay
          for (const { key: emailKey, emailData, email, _id } of emailsToSendThisHour) {
            console.log("Processing email key:", emailKey, "Email data:", emailData);
        
            // Ensure emailData contains the required fields
            if (!emailData || !email) {
                console.warn(`Invalid email data for key ${emailKey}:`, emailData);
                continue;
            }
        
            // Find the prospect by email
            const prospect = sequences.find(seq => seq._id === _id);
            if (!prospect) {
                console.warn(`Prospect not found for email: ${email}`);
                continue;
            }
            const prevEmailKey = `${parseInt(emailKey) - 1}_email`;
           
    if (emailKey !== "1_email" && !prospect.sequence[prevEmailKey].sent) {
        console.warn(`Previous email not sent for ${emailKey}. Skipping ${email}.`);
        continue;
    }
        
            // Send email logic
            try {
              const firstEmailKey = "1_email"; // Adjust this as per your sequence key for the first email
              const firstEmailMessageId = prospect.sequence[firstEmailKey]?.messageId;
              const messageId = await sendEmail(
                  email,
                  emailData.subject,
                  emailData.body,
                  (emailKey === "1_email")? null :firstEmailMessageId, // Reference the 1_email
                  (emailKey === "1_email")? null :(firstEmailMessageId ? `<${firstEmailMessageId}>` : null), // Threading references
                  (emailKey === "1_email")? null : prospect.sequence[firstEmailKey]?.body, // Original body
                  emailKey,
                  my_email,
                  _id
              );
              
        
                // Update database
                await db.collection("email_sequences").updateOne(
                    { "_id": _id },
                    { 
                        $set: { 
                            [`sequence.${emailKey}.sent`]: true, 
                            [`sequence.${emailKey}.messageId`]: messageId,
                            [`sequence.${emailKey}.sentAt`]: new Date() // Save the sent time
                        } 
                    }
                );
              
            } catch (error) {
                console.error(`Error sending email to ${email}:`, error);
        
                // Log the error to the "status" collection
                await db.collection("status").insertOne({
                    timestamp: new Date(),
                    type: "database_update_error",
                    prospectEmail: email,
                    emailKey,
                    error: error.message,
                });
            }
            await delay(DELAY_BETWEEN_EMAILS); // 90 seconds in milliseconds
        }
        
      }
  } catch (error) {
      console.error("Error in cron job:", error);

      // Log the general cron job error to the "status" collection
      await db.collection("status").insertOne({
          timestamp: new Date(),
          type: "cron_job_error",
          error: error.message,
      });
  }
});


const TRACKING_LOG_FILE = 'tracking_logs.json';

async function updateEmailOpened(email, emailKey, id) {
    try {
      const client = await MongoClient.connect(process.env.MONGO_URI);
      const db = client.db("contactsDB");
  
      const result = await db.collection("email_sequences").updateOne(
        { "_id": id },
        { $set: { [`sequence.${emailKey}.opened`]: true } } // Use dynamic key based on emailKey
      );
  
      console.log(`Email opened status updated for ${email}:`, result);
      client.close();
    } catch (error) {
      console.error("Error updating email opened status:", error);
    }
  }

// Serve the 1x1 pixel image
app.get('/track', (req, res) => {
    const { email, emailKey, id } = req.query;

    // Log the email open event
    const logEntry = {
        email: email || 'unknown',
        emailKey: emailKey || 'unknown',
        id: id || 'unknown',
        timestamp: new Date().toISOString(),
    };
    console.log('Tracking:', logEntry);
    updateEmailOpened(email, emailKey, id);
    // Append log entry to a file
    fs.appendFile(TRACKING_LOG_FILE, JSON.stringify(logEntry) + '\n', (err) => {
        if (err) {
            console.error('Failed to write log:', err);
        }
    });

    // Send the transparent image
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
        0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0xDA, 0x63, 0xF8, 0x0F, 0x00, 0x01,
        0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0x57, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]));
});

const PORT = process.env.PORT || 80;
app.listen(PORT, async () => {
    await connectToDb();
    console.log(`Server running on port ${PORT}`);
});