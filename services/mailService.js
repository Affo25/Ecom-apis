const nodemailer = require('nodemailer');
const { Verification_Email_Template } = require('../middleware/EmailTemplate');

// 1️⃣ Generate a random verification code (alphanumeric)
const generateVerificationCode = (length = 6) => {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";

  let code = "";

  // Ensure at least 3 letters
  for (let i = 0; i < 3; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }

  // Ensure at least 3 numbers
  for (let i = 0; i < 3; i++) {
    code += numbers[Math.floor(Math.random() * numbers.length)];
  }

  // Shuffle the result so it's not always "LLLNNN"
  code = code
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");

  return code;
};

// 🔒 Generate a numeric code for password reset
const generateNumericCode = (length = 6) => {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
};

// Example usage:
// console.log(generateVerificationCode()); // e.g., "w32o98"
// console.log(generateVerificationCode()); // e.g., "a9Xb12"


// 2️⃣ Create a function to send verification email
const sendVerificationEmail = async (toEmail) => {
  const verificationCode = generateVerificationCode().toUpperCase();

  // 3️⃣ Configure Gmail SMTP
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, // your Gmail address
      pass: process.env.GMAIL_PASS  // App Password if 2FA enabled
    }
  });

  // 4️⃣ Email details
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: toEmail,
    subject: 'Your Verification Code',
    text: `Your verification code is: ${verificationCode}`,
    html: Verification_Email_Template.replace('{verificationCode}', verificationCode)
  };

  // 5️⃣ Send email
  try {
    await transporter.sendMail(mailOptions);
    return verificationCode; // return code for saving in DB or cache
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send verification email');
  }
};

// 🔒 Send password reset email with alphanumeric code
const sendPasswordResetEmail = async (toEmail) => {
  const resetCode = generateVerificationCode(6).toUpperCase(); // 6-character alphanumeric code, uppercase

  // 3️⃣ Configure Gmail SMTP
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, // your Gmail address
      pass: process.env.GMAIL_PASS  // App Password if 2FA enabled
    }
  });

  // Create password reset email template
  const passwordResetTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Verification</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
            }
            .container {
                max-width: 600px;
                margin: 30px auto;
                background: #ffffff;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                border: 1px solid #ddd;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                text-align: center;
                font-size: 26px;
                font-weight: bold;
            }
            .content {
                padding: 25px;
                color: #333;
                line-height: 1.8;
            }
            .verification-code {
                display: block;
                margin: 20px 0;
                font-size: 32px;
                color: #667eea;
                background: #f8f9ff;
                border: 2px dashed #667eea;
                padding: 15px;
                text-align: center;
                border-radius: 8px;
                font-weight: bold;
                letter-spacing: 4px;
                font-family: 'Courier New', monospace;
            }
            .footer {
                background-color: #f4f4f4;
                padding: 15px;
                text-align: center;
                color: #777;
                font-size: 12px;
                border-top: 1px solid #ddd;
            }
            .warning {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                color: #856404;
                padding: 12px;
                border-radius: 5px;
                margin: 15px 0;
                font-size: 14px;
            }
            p {
                margin: 0 0 15px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">🔒 Password Reset</div>
            <div class="content">
                <p>Hello,</p>
                <p>You requested to reset your password for your Admin account. Please use the verification code below to proceed:</p>
                <span class="verification-code">{resetCode}</span>
                <div class="warning">
                    <strong>Security Notice:</strong> This code will expire in 10 minutes. If you didn't request this reset, please ignore this email or contact support.
                </div>
                <p>After verifying this code, you'll be able to set a new password for your account.</p>
                <p>If you have any questions, feel free to contact our support team.</p>
            </div>
            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} Admin Portal. All rights reserved.</p>
                <p>This is an automated message, please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
  `;

  // 4️⃣ Email details
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: toEmail,
    subject: '🔒 Password Reset Verification Code',
    text: `Your password reset verification code is: ${resetCode}. This code will expire in 10 minutes.`,
    html: passwordResetTemplate.replace('{resetCode}', resetCode)
  };

  // 5️⃣ Send email
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to: ${toEmail}`);
    return resetCode; // return code for saving in DB
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

// 6️⃣ Export the functions
module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  generateVerificationCode,
  generateNumericCode
};
