import { Resend } from "resend";

// Lazy-initialize to avoid build-time errors when env vars aren't available
let resend: Resend | null = null;

function getResendClient() {
    if (!resend) {
        if (!process.env.RESEND_API_KEY) {
            throw new Error("RESEND_API_KEY environment variable is not set");
        }
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

export async function sendEmail({
    to,
    subject,
    html,
    text,
}: {
    to: string;
    subject: string;
    html: string;
    text?: string;
}) {
    const from = process.env.RESEND_FROM || "Moltly <no-reply@moltly.xyz>";

    console.log("--------------- EMAIL DEBUG ---------------");
    console.log("Sending email via Resend:");
    console.log("  From:", from);
    console.log("  To:", to);
    console.log("  Subject:", subject);
    console.log("-------------------------------------------");

    try {
        const { data, error } = await getResendClient().emails.send({
            from,
            to,
            subject,
            html,
            text,
        });

        if (error) {
            console.error("Resend error:", error);
            throw new Error(error.message);
        }

        console.log(`Email sent successfully. ID: ${data?.id}`);
        return data;
    } catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }
}
