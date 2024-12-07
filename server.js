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

// Send email function with support for threading
async function sendEmail(recipient, subject, body, inReplyTo = null, references = null) {
    const mailOptions = {
        from: '"Ahmed Ait el aouad" <ahmed.ait.el.aouad@alcaotar.com>',
        to: recipient,
        subject: subject,
        html: body,
    };

    if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
    if (references) mailOptions.references = references;

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${recipient}: ${info.messageId}`);
        return info.messageId; // Return `Message-ID`
    } catch (error) {
        console.error("Error sending email:", error);
        return null; // Return null if failed
    }
}

// Cron job for sending emails based on the schedule
cron.schedule("* * * * *", async () => {
    const now = new Date();
    const currentDay = now.toLocaleString("en-US", { weekday: "long" });
    const currentHour = now.toTimeString().split(":")[0] + ":00";
    console.log(currentDay, currentHour);

    try {
        const prospects = await db.collection("email_sequences").find().toArray();

        for (const prospect of prospects) {
            const sequence = prospect.sequence;

            // Identify which emails to send
            const emailsToSend = Object.entries(sequence)
                .filter(([key, email]) => {
                    if (!email.time || !email.time.day || !email.time.hour) {
                        console.warn(`Invalid time data for ${key} in ${prospect.email}`);
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
                // Determine `In-Reply-To` and `References`
                let inReplyTo = null;
                let references = null;

                if (emailKey !== "email_1" && sequence.email_1.messageId) {
                    inReplyTo = sequence.email_1.messageId;
                    references = sequence.email_1.messageId;
                }

                // Send email
                console.log(`Sending ${emailKey} to ${prospect.email}`);
                const messageId = await sendEmail(
                    prospect.email,
                    emailDetails.subject,
                    emailDetails.body,
                    inReplyTo,
                    references
                );

                if (messageId) {
                    emailDetails.sent = true;
                    if (emailKey === "email_1") {
                        emailDetails.messageId = messageId; // Store `Message-ID` for the first email
                    }
                } else {
                    console.error(`Failed to send ${emailKey} to ${prospect.email}`);
                }
            }

            // Update the database with the new `sent` statuses
            await db.collection("email_sequences").updateOne(
                { _id: prospect._id },
                { $set: { sequence } }
            );
        }
    } catch (error) {
        console.error("Error in cron job:", error);
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    await connectToDb();
    console.log(`Server running on port ${PORT}`);
});
