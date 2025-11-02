const { Resend } = require('resend');

let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

const sendVerificationEmail = async (verifierEmail, token, itemTitle, userName, itemType = 'experience') => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verifier-invite/preview/${token}`;
  const dashboardUrl = `${process.env.FRONTEND_URL}/verifier/dashboard`;
  
  const itemTypeDisplay = itemType.toLowerCase().replace('_', ' ');
  
  const emailData = {
    from: process.env.FROM_EMAIL || 'TruePortMe <onboarding@resend.dev>',
    to: [verifierEmail],
    subject: `🔔 Verification Request: ${itemTitle}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">TruePortMe</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Portfolio Verification System</p>
        </div>
        
        <!-- Main Content -->
        <div style="padding: 30px 20px;">
          <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">New ${itemTypeDisplay.charAt(0).toUpperCase() + itemTypeDisplay.slice(1)} Verification Request</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.5;">Hello,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.5;">
            <strong>${userName}</strong> has requested you to verify their ${itemTypeDisplay}:
          </p>
          
          <!-- Item Card -->
          <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #495057; font-size: 18px;">${itemTitle}</h3>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="background: #007bff; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                ${itemType.replace('_', ' ')}
              </span>
              <span style="color: #6c757d; font-size: 14px;">• Requested by ${userName}</span>
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; 
                      box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3); margin-right: 10px;">
              🔍 Review & Verify
            </a>
            <a href="${dashboardUrl}" 
               style="background: #6c757d; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              📊 Go to Dashboard
            </a>
          </div>
          
          <!-- Login Info -->
          <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h4 style="margin: 0 0 10px 0; color: #1976d2; font-size: 14px;">📋 Quick Access</h4>
            <p style="margin: 0; color: #1565c0; font-size: 14px;">
              The verification link above will take you directly to the review page. You can also access your verifier dashboard to see all pending requests.
            </p>
          </div>
          
          <!-- Expiry Notice -->
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 12px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              ⏰ <strong>Important:</strong> This verification link will expire in 72 hours.
            </p>
          </div>
          
          <!-- Manual Link -->
          <details style="margin: 20px 0;">
            <summary style="color: #007bff; cursor: pointer; font-size: 14px;">Can't click the button? Use manual link</summary>
            <div style="background: #f8f9fa; padding: 10px; margin-top: 10px; border-radius: 4px;">
              <code style="word-break: break-all; font-size: 12px; color: #495057;">${verificationUrl}</code>
            </div>
          </details>
        </div>
        
        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This email was sent by TruePortMe Portfolio Verification System.<br>
            If you believe this was sent in error, please ignore this email.
          </p>
        </div>
      </div>
    `
  };

  try {
    if (resend && process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send(emailData);
      
      if (error) {
        console.error('❌ Resend API error:', error);
        return false;
      }
      
      console.log(`✅ Verification email sent to ${verifierEmail} (ID: ${data.id})`);
    } else {
      // Fallback to console.log for development
      console.log('📧 Email would be sent (no Resend API key configured):');
      console.log(`To: ${verifierEmail}`);
      console.log(`Subject: ${emailData.subject}`);
      console.log(`Verification URL: ${verificationUrl}`);
    }
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    return false;
  }
};

const sendVerificationDecisionEmail = async (studentEmail, itemTitle, itemType, status, comment, verifierName) => {
  const itemTypeDisplay = itemType.toLowerCase().replace('_', ' ');
  const statusColor = status === 'APPROVED' ? '#28a745' : '#dc3545';
  const statusText = status === 'APPROVED' ? 'Approved' : 'Rejected';
  
  const emailData = {
    from: process.env.FROM_EMAIL || 'TruePortMe <onboarding@resend.dev>',
    to: [studentEmail],
    subject: `Verification ${statusText}: ${itemTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${statusColor};">Verification ${statusText}</h2>
        <p>Hello,</p>
        <p>Your ${itemTypeDisplay} has been <strong style="color: ${statusColor};">${statusText.toLowerCase()}</strong> by ${verifierName}:</p>
        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin: 0; color: #555;">${itemTitle}</h3>
        </div>
        ${comment ? `
          <div style="background-color: #e9ecef; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 4px solid ${statusColor};">
            <h4 style="margin: 0 0 10px 0; color: #333;">Verifier Comments:</h4>
            <p style="margin: 0; color: #555;">${comment}</p>
          </div>
        ` : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/portfolio" 
             style="background-color: #007bff; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            View Your Portfolio
          </a>
        </div>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 12px;">
          This email was sent by TruePortMe.
        </p>
      </div>
    `
  };

  try {
    if (resend && process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send(emailData);
      
      if (error) {
        console.error('❌ Resend API error:', error);
        return false;
      }
      
      console.log(`✅ Verification decision email sent to ${studentEmail} (ID: ${data.id})`);
    } else {
      // Fallback to console.log for development
      console.log('📧 Decision email would be sent (no Resend API key configured):');
      console.log(`To: ${studentEmail}`);
      console.log(`Subject: ${emailData.subject}`);
      console.log(`Status: ${status}`);
    }
    return true;
  } catch (error) {
    console.error('❌ Decision email sending failed:', error);
    return false;
  }
};

const sendWelcomeEmailWithCredentials = async (userEmail, userName, password, institutionName) => {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  
  const emailData = {
    from: process.env.FROM_EMAIL || 'TruePortMe <onboarding@resend.dev>',
    to: [userEmail],
  subject: '🎉 Welcome to TruePortMe - Your Account Has Been Created',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">TruePortMe</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Portfolio Verification System</p>
        </div>
        
        <!-- Main Content -->
        <div style="padding: 30px 20px;">
          <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">Welcome to TruePortMe!</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.5;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.5;">
            Your account has been successfully created by the administrators at <strong>${institutionName}</strong>. 
            You can now access your TruePortMe account using the credentials below.
          </p>
          
          <!-- Credentials Card -->
          <div style="background: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; color: #495057; font-size: 18px;">Your Login Credentials</h3>
            <div style="margin: 10px 0;">
              <strong style="color: #333;">Email:</strong> 
              <span style="color: #007bff; font-family: monospace;">${userEmail}</span>
            </div>
            <div style="margin: 10px 0;">
              <strong style="color: #333;">Password:</strong> 
              <span style="background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-family: monospace; color: #495057;">${password}</span>
            </div>
          </div>
          
          <!-- Security Notice -->
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #856404; font-size: 14px;">🔒 Security Notice</h4>
            <p style="margin: 0; color: #856404; font-size: 14px;">
              For your security, we recommend changing your password after your first login. 
              Please keep your credentials secure and do not share them with anyone.
            </p>
          </div>
          
          <!-- Action Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; 
                      font-size: 16px; transition: all 0.3s ease;">
              Login to Your Account
            </a>
          </div>
          
          <!-- Getting Started -->
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h4 style="margin: 0 0 15px 0; color: #495057;">Getting Started</h4>
            <ul style="color: #555; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li>Complete your profile setup</li>
              <li>Add your experiences and education</li>
              <li>Upload your projects for verification</li>
              <li>Build your verified digital portfolio</li>
            </ul>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This email was sent by TruePortMe. If you have any questions, please contact your institution administrator.
          </p>
        </div>
      </div>
    `

  };

  try {
    if (resend && process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send(emailData);
      
      if (error) {
        console.error('❌ Resend API error:', error);
        return false;
      }
      
      console.log(`✅ Welcome email sent to ${userEmail} (ID: ${data.id})`);
    } else {
      // Fallback to console.log for development
      console.log('📧 Welcome email would be sent (no Resend API key configured):');
      console.log(`To: ${userEmail}`);
      console.log(`Subject: ${emailData.subject}`);
      console.log(`Name: ${userName}`);
      console.log(`Password: ${password}`);
    }
    return true;
    } catch (error) {
      console.error('❌ Welcome email sending failed:', error);
      return false;
    }
  };

  // Send a chat notification to an existing verifier (or newly created one).
  // chatLink is an optional frontend URL that opens the chat thread.
  const sendChatNotificationEmail = async (toEmail, toName, chatLink, note) => {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;

  const emailData = {
    from: process.env.FROM_EMAIL || 'TruePortMe <onboarding@resend.dev>',
    to: [toEmail],
    subject: "You've been added to a chat on TruePortMe",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You've been invited to a chat</h2>
        <p>Hello ${toName || ''},</p>
        <p>${note || 'A student has shared your contact for a background verification. You can open the chat to discuss the request.'}</p>
        ${chatLink ? `
          <div style="text-align: center; margin: 20px 0;">
            <a href="${chatLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Open Chat</a>
          </div>
        ` : ''}
        <div style="text-align: center; margin: 20px 0;">
          <a href="${loginUrl}" style="color: #007bff;">Login to TruePortMe</a>
        </div>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 12px;">This email was sent by TruePortMe.</p>
      </div>
    `
  };

  try {
    if (resend && process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send(emailData);
      if (error) {
        console.error('❌ Resend API error (chat notification):', error);
        return false;
      }
      console.log(`✅ Chat notification sent to ${toEmail} (ID: ${data.id})`);
    } else {
      console.log('📧 Chat notification (dev):');
      console.log(`To: ${toEmail}`);
      console.log(`Chat link: ${chatLink}`);
    }
    return true;
  } catch (error) {
    console.error('❌ Chat notification failed:', error);
    return false;
  }
};

const sendBGVerificationRequestToStudent = async (studentEmail, studentName, verifierName, verifierInstitute, refereeContactsRequested) => {
  const emailData = {
    from: process.env.FROM_EMAIL || 'TruePortMe <onboarding@resend.dev>',
    to: [studentEmail],
    subject: `🔔 Background Verification Request from ${verifierName}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">TruePortMe</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Portfolio Verification System</p>
        </div>
        
        <!-- Main Content -->
        <div style="padding: 30px 20px;">
          <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">Background Verification Request</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.5;">Hello <strong>${studentName}</strong>,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.5;">
            <strong>${verifierName}</strong> from <strong>${verifierInstitute}</strong> has requested your background verification. 
            This request requires you to provide <strong>${refereeContactsRequested}</strong> referee contact(s) to verify your background.
          </p>
          
          <!-- What's Next -->
          <div style="background: #f8f9fa; border-left: 4px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">📋 What You Need to Do</h3>
            <ol style="color: #555; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
              <li>Log in to your TruePortMe account</li>
              <li>Navigate to "Background Verification" in your dashboard</li>
              <li>Enter details for ${refereeContactsRequested} referee contact(s)</li>
              <li>Submit the referees for verification</li>
            </ol>
          </div>
          
          <!-- Important Info -->
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #856404; font-size: 14px;">⏰ Important</h4>
            <p style="margin: 0; color: #856404; font-size: 14px;">
              This background verification request will expire in <strong>30 days</strong> if not completed. 
              Please submit your referee contacts as soon as possible.
            </p>
          </div>
          
          <!-- Action Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/verifier/requests" 
               style="background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; 
                      font-size: 16px; box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3);">
              📲 View Your Requests
            </a>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This email was sent by TruePortMe Portfolio Verification System.
          </p>
        </div>
      </div>
    `
  };

  try {
    if (resend && process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send(emailData);
      if (error) {
        console.error('❌ Resend API error (BG verification to student):', error);
        return false;
      }
      console.log(`✅ BG verification request email sent to ${studentEmail} (ID: ${data.id})`);
    } else {
      console.log('📧 BG verification email (dev):');
      console.log(`To: ${studentEmail}`);
      console.log(`From: ${verifierName} (${verifierInstitute})`);
    }
    return true;
  } catch (error) {
    console.error('❌ BG verification email failed:', error);
    return false;
  }
};

const sendBGNotificationToSharedContact = async (contactEmail, contactName, verifierName, studentName, chatLink) => {
  const emailData = {
    from: process.env.FROM_EMAIL || 'TruePortMe <onboarding@resend.dev>',
    to: [contactEmail],
    subject: `📌 You've been added as a referee on TruePortMe`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">TruePortMe</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Portfolio Verification System</p>
        </div>
        
        <!-- Main Content -->
        <div style="padding: 30px 20px;">
          <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">You've Been Added as a Referee</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.5;">Hello <strong>${contactName}</strong>,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.5;">
            <strong>${verifierName}</strong> has requested you as a referee to verify information about <strong>${studentName}</strong> 
            for a background verification on TruePortMe.
          </p>
          
          <!-- Referee Details -->
          <div style="background: #f8f9fa; border-left: 4px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">Verification Details</h3>
            <p style="margin: 8px 0; color: #555;"><strong>Verifier:</strong> ${verifierName}</p>
            <p style="margin: 8px 0; color: #555;"><strong>Student:</strong> ${studentName}</p>
            <p style="margin: 8px 0; color: #555;"><strong>Type:</strong> Background Verification Referee</p>
          </div>
          
          <!-- Next Steps -->
          <div style="background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #1976d2; font-size: 16px;">Next Steps</h3>
            <p style="margin: 0; color: #1565c0; font-size: 14px;">
              Click the button below to open the chat and communicate with the verifier about the background verification details.
            </p>
          </div>
          
          <!-- Action Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${chatLink}" 
               style="background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; 
                      font-size: 16px; box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3);">
              💬 Open Chat
            </a>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This email was sent by TruePortMe Portfolio Verification System.
          </p>
        </div>
      </div>
    `
  };

  try {
    if (resend && process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send(emailData);
      if (error) {
        console.error('❌ Resend API error (BG notification to platform user):', error);
        return false;
      }
      console.log(`✅ BG referee notification sent to ${contactEmail} (ID: ${data.id})`);
    } else {
      console.log('📧 BG referee notification (dev):');
      console.log(`To: ${contactEmail}`);
      console.log(`From: ${verifierName}`);
    }
    return true;
  } catch (error) {
    console.error('❌ BG referee notification failed:', error);
    return false;
  }
};

const sendMagicLinkToExternal = async (contactEmail, contactName, magicLinkUrl, verifierName, studentName) => {
  const emailData = {
    from: process.env.FROM_EMAIL || 'TruePortMe <onboarding@resend.dev>',
    to: [contactEmail],
    subject: `🔐 Sign in to TruePortMe - Referee Request`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">TruePortMe</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Portfolio Verification System</p>
        </div>
        
        <!-- Main Content -->
        <div style="padding: 30px 20px;">
          <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">Sign in to TruePortMe</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.5;">Hello <strong>${contactName}</strong>,</p>
          <p style="color: #555; font-size: 16px; line-height: 1.5;">
            <strong>${verifierName}</strong> has requested you as a referee to verify information about <strong>${studentName}</strong>. 
            Click the button below to sign in and access the background verification chat.
          </p>
          
          <!-- Magic Link Info -->
          <div style="background: #f8f9fa; border-left: 4px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">🔐 Secure Sign-In Link</h3>
            <p style="margin: 0; color: #555; font-size: 14px;">
              Click the button below to securely sign in. No password needed — this link will create your account and log you in automatically.
            </p>
          </div>
          
          <!-- Action Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLinkUrl}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; 
                      text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; 
                      font-size: 16px; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);">
              🔓 Sign In & Access Chat
            </a>
          </div>
          
          <!-- Manual Link -->
          <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; color: #6c757d; font-size: 12px;">Can't click the button? Copy this link:</p>
            <code style="display: block; word-break: break-all; font-size: 11px; color: #495057; padding: 8px; background: #ffffff; border-radius: 4px; overflow-x: auto;">${magicLinkUrl}</code>
          </div>
          
          <!-- Security Notice -->
          <div style="background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <h4 style="margin: 0 0 8px 0; color: #2e7d32; font-size: 14px;">🛡️ Security Information</h4>
            <p style="margin: 0; color: #388e3c; font-size: 12px;">
              This link will expire in 7 days. It's unique to you and secure — don't share it with others.
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This email was sent by TruePortMe Portfolio Verification System. 
            If you did not expect this email, please ignore it.
          </p>
        </div>
      </div>
    `
  };

  try {
    if (resend && process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send(emailData);
      if (error) {
        console.error('❌ Resend API error (magic link to external):', error);
        return false;
      }
      console.log(`✅ Magic link email sent to ${contactEmail} (ID: ${data.id})`);
    } else {
      console.log('📧 Magic link email (dev):');
      console.log(`To: ${contactEmail}`);
      console.log(`Link: ${magicLinkUrl}`);
    }
    return true;
  } catch (error) {
    console.error('❌ Magic link email failed:', error);
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  sendVerificationDecisionEmail,
  sendWelcomeEmailWithCredentials,
  sendChatNotificationEmail,
  sendBGVerificationRequestToStudent,
  sendBGNotificationToSharedContact,
  sendMagicLinkToExternal
};