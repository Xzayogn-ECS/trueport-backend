const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const VerifierInvite = require('../models/VerifierInvite');
const Verification = require('../models/Verification');
const Experience = require('../models/Experience');
const Education = require('../models/Education');
const User = require('../models/User');
const { requireAuth } = require('../middlewares/auth');
const { sendVerificationEmail } = require('../utils/email');
const { generateVerificationToken } = require('../utils/jwt');
const router = express.Router();

// Configurable TTLs
const INVITE_TTL_MS = (process.env.INVITE_TTL_HOURS ? parseInt(process.env.INVITE_TTL_HOURS) : 72) * 60 * 60 * 1000; // default 72h
const ACTION_TTL_MS = (process.env.ACTION_TTL_MINUTES ? parseInt(process.env.ACTION_TTL_MINUTES) : 30) * 60 * 1000; // default 30m

// Helper to sign invite token
function signInviteToken(payload, expiresInSeconds) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${expiresInSeconds}s` });
}

// Create a new verifier invite and send email. If verificationId is not provided,
// allow creating a new Verification record from { name, email, organization, itemType, itemId } payload.
router.post('/', requireAuth, async (req, res) => {
  try {
    let { verificationId, name, email, organization, message, itemType, itemId } = req.body;
    console.log(req.body);

    // If verificationId not provided, require itemType and itemId plus email
    if (!verificationId) {
      if (!email || !itemType || !itemId) {
        return res.status(400).json({ message: 'Either verificationId or (email, itemType, itemId) must be provided' });
      }

      itemType = itemType.toUpperCase();
      const validTypes = ['EXPERIENCE', 'EDUCATION'];
      if (!validTypes.includes(itemType)) {
        return res.status(400).json({ message: 'Invalid item type. Must be EXPERIENCE or EDUCATION' });
      }

      // Ensure item exists
      let itemExists = null;
      if (itemType === 'EXPERIENCE') {
        itemExists = await Experience.findById(itemId).select('_id title');
      } else if (itemType === 'EDUCATION') {
        itemExists = await Education.findById(itemId).select('_id courseName title');
      }

      if (!itemExists) {
        return res.status(404).json({ message: `${itemType.toLowerCase()} not found` });
      }

      // Do not allow external verifier invites for GitHub projects (safety)
      if (itemType === 'GITHUB_PROJECT') {
        return res.status(400).json({ message: 'Invites are not supported for GitHub projects' });
      }

      // Check if a pending verification already exists for this item (regardless of verifier email)
      const emailLower = email.trim().toLowerCase();
      const existingVerification = await Verification.findOne({ itemId, itemType, status: 'PENDING', expiresAt: { $gt: new Date() } });
      if (existingVerification) {
        // If a pending verification exists for this item, only allow reusing it when
        // the pending verification targets the same verifier email. Prevent sending
        // invites to other emails while a pending verification exists.
        if (existingVerification.verifierEmail && existingVerification.verifierEmail.toLowerCase() === emailLower) {
          verificationId = existingVerification._id;
        } else {
          return res.status(400).json({ message: 'A verification request is already pending for this item' });
        }
      } else {
        // create verification record (use helper to avoid races)
        const { createOrGetPendingVerification } = require('../utils/createVerification');
        const { verification, created } = await createOrGetPendingVerification({
          itemId,
          itemType,
          verifierEmail: emailLower,
          verifierName: name?.trim() || '',
          verifierOrganization: organization?.trim() || '',
          actorEmail: req.user.email,
          metadata: { itemType }
        });
        verificationId = verification._id;
      }
    }

    // At this point we have verificationId and email
    if (!email) {
      // If email wasn't provided earlier, fetch from verification
      const verification = await Verification.findById(verificationId);
      if (!verification) return res.status(404).json({ message: 'Verification record not found' });
      email = verification.verifierEmail;
    }

    const verification = await Verification.findById(verificationId);
    if (!verification) return res.status(404).json({ message: 'Verification record not found' });

    // Do not allow external verifier invites for GitHub projects
    if (verification.itemType === 'GITHUB_PROJECT') {
      return res.status(400).json({ message: 'Invites are not supported for GitHub projects' });
    }

    // Rate-limit simple: per student per verification
    const existing = await VerifierInvite.findOne({ verificationId, emailLower: email.toLowerCase(), status: 'PENDING' });
    if (existing) {
      return res.status(400).json({ message: 'An invite to this email for this verification is already pending' });
    }

    const invite = new VerifierInvite({
      verificationId,
      email: email.trim(),
      emailLower: email.trim().toLowerCase(),
      name: name?.trim() || '',
      organization: organization?.trim() || '',
      message: message?.trim() || '',
      createdByUserId: req.user._id,
      lastSentAt: new Date(),
      notifyCount: 1
    });

    // Create jti and token
    const jti = uuidv4();
    invite.tokenJti = jti;
    invite.tokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await invite.save();

    // Sign a JWT (72h default) with minimal payload
    const expiresInSec = Math.floor(INVITE_TTL_MS / 1000);
    const token = signInviteToken({ sub: invite._id.toString(), purpose: 'invite_claim', jti, email: invite.emailLower }, expiresInSec);

    // Send email using existing utility
    try {
      // Ensure verification has verifier name/org stored for display
      if (!verification.verifierName) verification.verifierName = invite.name || invite.email;
      if (!verification.verifierOrganization) verification.verifierOrganization = invite.organization || '';
      await verification.save();

      // Try to derive a title from the associated item if possible
      let itemTitle = verification.itemTitle || 'Verification Request';
      try {
        if (verification.itemType === 'EXPERIENCE') {
          const ex = await Experience.findById(verification.itemId).select('title');
          if (ex && ex.title) itemTitle = ex.title;
        } else if (verification.itemType === 'EDUCATION') {
          const ed = await Education.findById(verification.itemId).select('courseName title');
          if (ed && (ed.courseName || ed.title)) itemTitle = ed.courseName || ed.title;
        }
      } catch (err) {
        // ignore
      }

      await sendVerificationEmail(invite.email, token, itemTitle, req.user.name, verification.itemType);
    } catch (err) {
      console.warn('Email send failed for invite:', err.message || err);
    }

    res.status(201).json({ inviteId: invite._id, status: invite.status, expiresAt: invite.tokenExpiresAt, verificationId });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ message: 'Failed to create invite', error: error.message });
  }
});

// Resend invite (reissue token)
router.post('/:id/resend', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const invite = await VerifierInvite.findById(id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.createdByUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only invite creator can resend' });
    }

    // Reissue jti and token
    const jti = uuidv4();
    invite.tokenJti = jti;
    invite.tokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    invite.lastSentAt = new Date();
    invite.notifyCount = (invite.notifyCount || 0) + 1;
    await invite.save();

    const expiresInSec = Math.floor(INVITE_TTL_MS / 1000);
    const token = signInviteToken({ sub: invite._id.toString(), purpose: 'invite_claim', jti, email: invite.emailLower }, expiresInSec);

    // Send email
    const verification = await Verification.findById(invite.verificationId);
    try {
      await sendVerificationEmail(invite.email, token, verification?.itemTitle || 'Verification Request', req.user.name, verification?.itemType);
    } catch (err) {
      console.warn('Resend email failed:', err.message || err);
    }

    res.json({ ok: true, inviteId: invite._id, expiresAt: invite.tokenExpiresAt });
  } catch (error) {
    console.error('Resend invite error:', error);
    res.status(500).json({ message: 'Failed to resend invite', error: error.message });
  }
});

// Preview invite (validate token and return minimal info) - token in body
router.post('/preview', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token required' });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); } catch (err) { return res.status(400).json({ message: 'Invalid or expired token' }); }
    if (decoded.purpose !== 'invite_claim') return res.status(400).json({ message: 'Invalid token purpose' });

    const invite = await VerifierInvite.findById(decoded.sub);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.tokenJti !== decoded.jti) return res.status(400).json({ message: 'Token invalidated' });
    if (invite.status !== 'PENDING') return res.status(410).json({ message: 'Invite not pending' });

    // Minimal info
    const verification = await Verification.findById(invite.verificationId).select('itemType itemId');
    return res.json({ invite: { id: invite._id, name: invite.name, email: invite.email, organization: invite.organization, message: invite.message, expiresAt: invite.tokenExpiresAt }, verification: { id: verification?._id, type: verification?.itemType } });
  } catch (error) {
    console.error('Preview invite error:', error);
    res.status(500).json({ message: 'Failed to preview invite', error: error.message });
  }
});

// Claim invite - token in body. Does NOT create account, just validates and returns action token
router.post('/:id/claim', async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token required' });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); } catch (err) { return res.status(400).json({ message: 'Invalid or expired token' }); }
    if (decoded.purpose !== 'invite_claim') return res.status(400).json({ message: 'Invalid token purpose' });

    if (decoded.sub !== id) return res.status(400).json({ message: 'Token does not match invite' });

    const invite = await VerifierInvite.findById(id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.tokenJti !== decoded.jti) return res.status(400).json({ message: 'Token invalidated' });
    if (invite.status !== 'PENDING') return res.status(410).json({ message: 'Invite not pending' });

    // Bind token to email: ensure decoded email equals invite.emailLower
    if (!decoded.email || decoded.email.toLowerCase() !== invite.emailLower) {
      return res.status(403).json({ message: 'Token email does not match invite email' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: invite.emailLower });
    const hasAccount = !!existingUser;

    // Mark invite as accepted
    invite.usedAt = new Date();
    invite.status = 'ACCEPTED';
    if (existingUser) {
      invite.usedByUserId = existingUser._id;
      // Ensure existing user has verifier role
      if (existingUser.role !== 'VERIFIER') {
        existingUser.role = 'VERIFIER';
        await existingUser.save();
      }
    }

    // Generate a short-lived action token (30m default) so verifier can act immediately without full login
    const actionJti = uuidv4();
    invite.actionTokenJti = actionJti;
    invite.actionTokenExpiresAt = new Date(Date.now() + ACTION_TTL_MS);
    await invite.save();

    // Update verification record to store verifier name/org for display
    try {
      const verification = await Verification.findById(invite.verificationId);
      if (verification) {
        verification.verifierName = invite.name || invite.email;
        verification.verifierOrganization = invite.organization || verification.verifierOrganization || '';
        await verification.save();
      }
    } catch (err) {
      console.warn('Failed to update verification with verifier info:', err.message || err);
    }

    // Sign action token JWT
    const actionExpiresInSec = Math.floor(ACTION_TTL_MS / 1000);
    const actionToken = jwt.sign({ sub: invite._id.toString(), purpose: 'verification_action', jti: actionJti, email: invite.emailLower }, process.env.JWT_SECRET, { expiresIn: `${actionExpiresInSec}s` });

    // If user exists, also return auth token
    let authToken = null;
    if (existingUser) {
      const { generateToken } = require('../utils/jwt');
      authToken = generateToken({ userId: existingUser._id, email: existingUser.email, role: existingUser.role });
    }

    res.json({ 
      ok: true, 
      hasAccount, 
      actionToken, 
      token: authToken, // null if no account
      user: existingUser ? existingUser.toJSON() : null,
      verificationId: invite.verificationId
    });
  } catch (error) {
    console.error('Claim invite error:', error);
    res.status(500).json({ message: 'Failed to claim invite', error: error.message });
  }
});

// Create account endpoint - requires password and valid action token or invite token
router.post('/:id/create-account', async (req, res) => {
  try {
    const { id } = req.params;
    const { token, password, name } = req.body;
    
    if (!token) return res.status(400).json({ message: 'Token required' });
    if (!password || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); } catch (err) { return res.status(400).json({ message: 'Invalid or expired token' }); }
    
    // Accept either invite_claim or verification_action token
    if (!['invite_claim', 'verification_action'].includes(decoded.purpose)) {
      return res.status(400).json({ message: 'Invalid token purpose' });
    }

    const invite = await VerifierInvite.findById(id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    
    // Validate token based on purpose
    if (decoded.purpose === 'invite_claim') {
      if (invite.tokenJti !== decoded.jti) return res.status(400).json({ message: 'Token invalidated' });
    } else if (decoded.purpose === 'verification_action') {
      if (invite.actionTokenJti !== decoded.jti) return res.status(400).json({ message: 'Token invalidated' });
    }

    // Bind token to email
    if (!decoded.email || decoded.email.toLowerCase() !== invite.emailLower) {
      return res.status(403).json({ message: 'Token email does not match invite email' });
    }

    // Check if user already exists
    let user = await User.findOne({ email: invite.emailLower });
    if (user) {
      return res.status(400).json({ message: 'Account already exists. Please login.' });
    }

    // Create new VERIFIER account
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    user = new User({ 
      name: name || invite.name || invite.email.split('@')[0], 
      email: invite.emailLower, 
      passwordHash: hashedPassword, 
      role: 'VERIFIER', 
      emailVerified: true 
    });
    await user.save();

    // Update invite with user ID
    invite.usedByUserId = user._id;
    await invite.save();

    // Issue session token
    const { generateToken } = require('../utils/jwt');
    const authToken = generateToken({ userId: user._id, email: user.email, role: user.role });

    res.status(201).json({ 
      ok: true, 
      created: true,
      token: authToken, 
      user: user.toJSON(),
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ message: 'Failed to create account', error: error.message });
  }
});

// Report abuse - revoke invite
router.post('/:id/report-abuse', async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.body; // optional
    const invite = await VerifierInvite.findById(id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });

    invite.complaintFlag = true;
    invite.status = 'REVOKED';
    invite.statusReason = 'Reported by recipient';
    await invite.save();

    // TODO: notify admins

    res.json({ ok: true });
  } catch (error) {
    console.error('Report abuse error:', error);
    res.status(500).json({ message: 'Failed to report abuse', error: error.message });
  }
});

module.exports = router;
