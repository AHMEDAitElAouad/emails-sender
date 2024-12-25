// const express = require("express");
// const { MongoClient } = require("mongodb");
// const nodemailer = require("nodemailer");
// const cron = require("node-cron");
// require("dotenv").config();

// const app = express();
// app.use(express.json());

// const client = new MongoClient(process.env.MONGO_URI);
// let db;

// async function connectToDb() {
//     try {
//         await client.connect();
//         db = client.db("contactsDB"); // Replace with your DB name
//         console.log("Connected to MongoDB");
//     } catch (error) {
//         console.error("Error connecting to MongoDB:", error);
//         process.exit(1);
//     }
// }

// const transporter = nodemailer.createTransport({
//     host: "smtp.zoho.com",
//     port: 465,
//     secure: true, // use SSL // Change this to your provider
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//     }
// });


// async function sendEmail(recipient, subject, body) {
//     try {
//         await transporter.sendMail({
//             from: '"Ahmed Ait el aouad" <ahmed.ait.el.aouad@alcaotar.com>',
//             to: recipient,
//             subject: subject,
//             html: body,
//         });

//         console.log(`Email sent to ${recipient}`);
//         return true; // Return success status
//     } catch (error) {
//         console.error("Error sending email:", error);
//         return false; // Return failure status
//     }
// }


// cron.schedule("* * * * *", async () => {
//     const now = new Date();
//     const currentDay = now.toLocaleString("en-US", { weekday: "long" });
//     const currentHour = now.toTimeString().split(":")[0] + ":00";
//     console.log(currentDay, currentHour);

//     try {
//         const prospects = await db.collection("email_sequences").find().toArray();

//         for (const prospect of prospects) {
//             const sequence = prospect.sequence;

//             const emailsToSend = Object.entries(sequence)
//                 .filter(([key, email]) => {
//                     // Ensure email.time exists before accessing day and hour
//                     if (!email.time || !email.time.day || !email.time.hour) {
//                         console.warn(`Invalid time data for email ${key} in prospect ${prospect.email}`);
//                         return false;
//                     }
//                     return (
//                         email.time.day === currentDay &&
//                         email.time.hour === currentHour &&
//                         !email.sent
//                     );
//                 })
//                 .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

//             for (const [emailKey, emailDetails] of emailsToSend) {
//                 const previousEmailKey = Object.keys(sequence)
//                     .filter(key => key < emailKey)
//                     .sort()
//                     .pop();

//                 const canSend = !previousEmailKey || (sequence[previousEmailKey] && sequence[previousEmailKey].sent);

//                 if (canSend) {
//                     console.log(`Sending ${emailKey} to ${prospect.email}`);
//                     const success = await sendEmail(prospect.email, emailDetails.subject, emailDetails.body);
            
//                     if (success) {
//                         emailDetails.sent = true; // Update only after successful send
//                     }
//                 } else {
//                     console.log(
//                         `Skipping ${emailKey} for ${prospect.email} because ${previousEmailKey} has not been sent.`
//                     );
//                 }
//             }

//             // Update the database with the new `sent` statuses
//             await db.collection("email_sequences").updateOne(
//                 { _id: prospect._id },
//                 { $set: { sequence } }
//             );
//         }
//     } catch (error) {
//         console.error("Error in cron job:", error);
//     }
// });


// const PORT = process.env.PORT || 3001;
// app.listen(PORT, async () => {
//     await connectToDb();
//     console.log(`Server running on port ${PORT}`);
// });
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

const transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465,
    secure: true, // use SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function sendEmail(recipient, image, subject, body, inReplyTo = null, references = null, originalBody = null) {
    // Construct the reply body if it's a reply
    const replyBody = inReplyTo
        ? `${body}<br/><br/><hr style="border:none;border-top:1px solid #ccc"/><p> --- On ${new Date().toLocaleString()}, Ahmed Ait el aouad <ahmed.ait.el.aouad@alcaotar.com> wrote ---<br/>${originalBody}<br/><img src=${image}></p>`
        : `${body}<br/><img src=${image}>`;

    const mailOptions = {
        from: '"Ahmed Ait el aouad" <ahmed.ait.el.aouad@alcaotar.com>',
        to: recipient,
        subject: inReplyTo ? `Re: ${subject}` : subject,
        html: replyBody,
    };

    // Add threading headers if this is a reply
    if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
    if (references) mailOptions.references = references;

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${recipient}: ${info.messageId}`);
        return info.messageId; // Return `Message-ID` for threading
    } catch (error) {
        console.error("Error sending email:", error);
        return null; // Return null if failed
    }
}

cron.schedule("* * * * *", async () => {
    const now = new Date();
    const currentDay = now.toLocaleString("en-US", { weekday: "long" });
    const currentHour = now.toTimeString().split(":")[0] + ":00";
    console.log(currentDay, currentHour);

    try {
        const prospects = await db.collection("email_sequences").find().toArray();

        for (const prospect of prospects) {
            const sequence = prospect.sequence;

            const emailsToSend = Object.entries(sequence)
                .filter(([key, email]) => {
                    if (!email.time || !email.time.day || !email.time.hour) {
                        console.warn(`Invalid time data for email ${key} in prospect ${prospect.email}`);
                        return false;
                    }
                    return (
                        email.time.day === currentDay &&
                        email.time.hour === currentHour &&
                        !email.sent
                    );
                })
                .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

            for (const [emailKey, emailDetails] of emailsToSend) {
                try {
                    let inReplyTo = null;
                    let references = null;
                    let originalBody = null;

                    // For replies, use the first email's `Message-ID` and fetch the original body
                    if (emailKey !== "1_email" && sequence["1_email"].messageId) {
                        inReplyTo = sequence["1_email"].messageId;
                        references = sequence["1_email"].messageId;
                        originalBody = sequence["1_email"].body; // Fetch the original email's body
                    }

                    // Send email
                    console.log(`Sending ${emailKey} to ${prospect.email}`);
                    const messageId = await sendEmail(
                        prospect.email,
                        prospect.image_link,
                        emailDetails.subject,
                        emailDetails.body,
                        inReplyTo,
                        references,
                        originalBody
                    );

                    if (messageId) {
                        emailDetails.sent = true;
                        if (emailKey === "1_email") {
                            emailDetails.messageId = messageId; // Store `Message-ID` for the first email
                        }
                    } else {
                        throw new Error(`Failed to send ${emailKey} to ${prospect.email}`);
                    }
                } catch (error) {
                    console.error(`Error sending ${emailKey} for ${prospect.email}:`, error);

                    // Log the error to the "status" collection
                    await db.collection("status").insertOne({
                        timestamp: new Date(),
                        type: "email_send_error",
                        prospectEmail: prospect.email,
                        emailKey,
                        error: error.message,
                    });
                }
            }

            try {
                // Update the database with the new `sent` statuses
                await db.collection("email_sequences").updateOne(
                    { _id: prospect._id },
                    { $set: { sequence } }
                );
            } catch (error) {
                console.error(`Error updating database for ${prospect.email}:`, error);

                // Log the error to the "status" collection
                await db.collection("status").insertOne({
                    timestamp: new Date(),
                    type: "database_update_error",
                    prospectEmail: prospect.email,
                    error: error.message,
                });
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

// Serve the 1x1 pixel image
app.get('/track', (req, res) => {
    const { email } = req.query;

    // Log the email open event
    const logEntry = {
        email: email || 'unknown',
        timestamp: new Date().toISOString(),
    };
    console.log('Tracking:', logEntry);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await connectToDb();
    console.log(`Server running on port ${PORT}`);
});