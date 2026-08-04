const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html }) {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL, // e.g. "Losub <onboarding@resend.dev>" until you verify your own domain
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error("Failed to send email");
    }

    console.log(`Email sent to ${to}: "${subject}" (id: ${data.id})`);
  } catch (err) {
    console.error("Resend error:", err.message);
    throw new Error("Failed to send email");
  }
}

function verificationEmail(fullname, link) {
  return {
    subject: "Verify your Losub email",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Welcome to Losub, ${fullname}</h2>
        <p>Please confirm your email address to activate your account.</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#14120E;color:#fff;text-decoration:none;border-radius:999px;">Verify my email</a></p>
        <p style="color:#888;font-size:13px;">This link expires in 24 hours. If you didn't create a Losub account, you can ignore this email.</p>
      </div>
    `,
  };
}

function resetPasswordEmail(fullname, link) {
  return {
    subject: "Reset your Losub password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hi ${fullname},</h2>
        <p>We received a request to reset your Losub password.</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#14120E;color:#fff;text-decoration:none;border-radius:999px;">Reset my password</a></p>
        <p style="color:#888;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };
}

module.exports = { sendEmail, verificationEmail, resetPasswordEmail };
