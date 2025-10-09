const express = require('express');
const jwt = require('jsonwebtoken');
const Verification = require('../models/Verification');
const VerifierInvite = require('../models/VerifierInvite');
const VerificationLog = require('../models/VerificationLog');
const Experience = require('../models/Experience');
const Education = require('../models/Education');
const User = require('../models/User');
const { requireAuth } = require('../middlewares/auth');
const { sendVerificationDecisionEmail } = require('../utils/email');

const router = express.Router();

// Helper function to get model based on item type
const getModel = (itemType) => {
  switch (itemType.toUpperCase()) {
    case 'EXPERIENCE': return Experience;
    case 'EDUCATION': return Education;
    default: throw new Error('Invalid item type');
  }
};

// Helper to validate action token
async function validateActionToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'verification_action') throw new Error('Invalid token purpose');
    const invite = await VerifierInvite.findById(decoded.sub);
    if (!invite) throw new Error('Invite not found');
    if (invite.actionTokenJti !== decoded.jti) throw new Error('Token invalidated');
    if (invite.actionTokenExpiresAt && invite.actionTokenExpiresAt < new Date()) throw new Error('Action token expired');
    if (invite.status !== 'ACCEPTED') throw new Error('Invite not accepted');
    return { invite, decoded };
  } catch (err) {
    throw err;
  }
}

// Get verification details using action token (for magic link users)
router.post('/:verificationId/details', async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Action token required' });
    }

    // Validate action token
    let validated;
    try {
      validated = await validateActionToken(token);
    } catch (err) {
      return res.status(400).json({ message: 'Invalid action token', error: err.message });
    }

    const actorEmail = validated.invite.emailLower;

    const verification = await Verification.findById(verificationId);
    if (!verification) {
      return res.status(404).json({ message: 'Verification not found' });
    }

    // Ensure actor matches the expected verifier email
    if (verification.verifierEmail.toLowerCase() !== actorEmail.toLowerCase()) {
      return res.status(403).json({ message: 'Action allowed only by designated verifier' });
    }

    // Get the actual item and student details
    const Model = getModel(verification.itemType);
    const item = await Model.findById(verification.itemId).populate('userId', 'name email institute');

    if (!item || !item.userId) {
      return res.status(404).json({ message: 'Associated item not found' });
    }

    // Get verification logs
    const logs = await VerificationLog.find({ verificationId: verification._id }).sort({ createdAt: 1 });

    // Build comprehensive item details based on type
    let itemDetails = {
      id: item._id,
      type: verification.itemType,
      title: item.title || item.courseName || item.projectName,
      description: item.description,
      attachments: item.attachments || []
    };

    // Add type-specific fields
    if (verification.itemType === 'EXPERIENCE') {
      itemDetails = {
        ...itemDetails,
        role: item.role,
        startDate: item.startDate,
        endDate: item.endDate,
        tags: item.tags || [],
        isPublic: item.isPublic,
        verified: item.verified,
        verifiedAt: item.verifiedAt,
        verifiedBy: item.verifiedBy,
        verifierComment: item.verifierComment,
        verifierName: item.verifierName,
        verifierOrganization: item.verifierOrganization,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    } else if (verification.itemType === 'EDUCATION') {
      itemDetails = {
        ...itemDetails,
        courseName: item.courseName,
        institution: item.institution,
        degree: item.degree,
        fieldOfStudy: item.fieldOfStudy,
        grade: item.grade,
        passingYear: item.passingYear,
        startDate: item.startDate,
        endDate: item.endDate,
        verified: item.verified,
        verifiedAt: item.verifiedAt,
        verifiedBy: item.verifiedBy,
        verifierComment: item.verifierComment,
        verifierName: item.verifierName,
        verifierOrganization: item.verifierOrganization,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    }

    const request = {
      _id: verification._id,
      status: verification.status,
      verifierEmail: verification.verifierEmail,
      verifierName: verification.verifierName,
      verifierOrganization: verification.verifierOrganization,
      comment: verification.comment,
      createdAt: verification.createdAt,
      actedAt: verification.actedAt,
      expiresAt: verification.expiresAt,
      item: itemDetails,
      student: {
        id: item.userId._id,
        name: item.userId.name,
        email: item.userId.email,
        institute: item.userId.institute
      },
      logs: logs.map(log => ({
        action: log.action,
        actionBy: log.actorEmail,
        createdAt: log.createdAt,
        metadata: log.metadata
      }))
    };

    res.json({ request });
  } catch (error) {
    console.error('Get verification details error:', error);
    res.status(500).json({ message: 'Failed to fetch verification details', error: error.message });
  }
});

// Decision endpoint: allow either logged-in verifier or action token in body
router.post('/:verificationId/decision', async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { decision, comment, token } = req.body;

    if (!['APPROVE','DENY'].includes(decision)) {
      return res.status(400).json({ message: 'Invalid decision' });
    }

    let actorEmail = null;
    let actorUserId = null;

    // If token provided, validate it
    if (token) {
      let validated;
      try { validated = await validateActionToken(token); } catch (err) { return res.status(400).json({ message: 'Invalid action token', error: err.message }); }
      actorEmail = validated.invite.emailLower;
      actorUserId = validated.invite.usedByUserId;
    } else {
      // Use authenticated verifier
      try {
        await new Promise((resolve, reject) => requireAuth(req, res, (err) => err ? reject(err) : resolve()));
      } catch (err) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      if (!req.user || req.user.role !== 'VERIFIER') return res.status(403).json({ message: 'Verifier role required' });
      actorEmail = req.user.email.toLowerCase();
      actorUserId = req.user._id;
    }

    const verification = await Verification.findById(verificationId);
    if (!verification) return res.status(404).json({ message: 'Verification not found' });

    // Ensure actor matches the expected verifier email
    if (verification.verifierEmail.toLowerCase() !== actorEmail.toLowerCase()) {
      return res.status(403).json({ message: 'Action allowed only by designated verifier' });
    }

    // Ensure pending
    if (verification.status !== 'PENDING') {
      return res.status(410).json({ message: 'Verification already processed' });
    }

    // Update verification based on decision
    if (decision === 'APPROVE') {
      verification.status = 'APPROVED';
    } else if (decision === 'DENY') {
      verification.status = 'REJECTED';
    }

    verification.comment = comment || '';
    verification.decidedBy = actorUserId;
    verification.decidedAt = new Date();
    verification.decisionComment = comment || '';
    await verification.save();

    // Map decision to log action
    let logAction = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await new VerificationLog({ verificationId: verification._id, action: logAction, actorEmail: actorEmail, metadata: { comment: comment || '' } }).save();

    // If approve, also mark actual item verified
    if (decision === 'APPROVE') {
      try {
        const Model = getModel(verification.itemType);
        
        // Persist verifier identity on the item as well
        const update = { verified: true, verifiedAt: new Date(), verifiedBy: actorEmail, verifierComment: comment || '' };
        try {
          const invite = await VerifierInvite.findOne({ verificationId: verification._id });
          if (invite) {
            update.verifierName = invite.name || invite.email;
            update.verifierOrganization = invite.organization || '';
          } else {
            update.verifierName = verification.verifierName || actorEmail;
            update.verifierOrganization = verification.verifierOrganization || '';
          }
        } catch (err) {
          update.verifierName = verification.verifierName || actorEmail;
          update.verifierOrganization = verification.verifierOrganization || '';
        }

        await Model.findByIdAndUpdate(verification.itemId, update);
        
        // Also persist verifier name/org on verification (if invite exists)
        try {
          const invite = await VerifierInvite.findOne({ verificationId: verification._id });
          if (invite) {
            verification.verifierName = invite.name || verification.verifierName || actorEmail;
            verification.verifierOrganization = invite.organization || verification.verifierOrganization || '';
            await verification.save();
          }
        } catch (innerErr) {
          console.warn('Failed to persist verifier info on approval:', innerErr.message || innerErr);
        }
      } catch (err) {
        console.warn('Failed to update item verified flag:', err.message || err);
      }
    } else if (decision === 'DENY') {
      // For rejection, update item with rejection details
      try {
        const Model = getModel(verification.itemType);
        const update = { verifiedBy: actorEmail, verifierComment: comment || '' };
        await Model.findByIdAndUpdate(verification.itemId, update);
      } catch (err) {
        console.warn('Failed to update item with rejection details:', err.message || err);
      }
    }

    // Notify student
    try {
      // Get student email from item
      const Model = getModel(verification.itemType);
      const item = await Model.findById(verification.itemId).populate('userId', 'name email');
      const itemTitle = item?.title || item?.courseName || 'Item';
      const studentEmail = item?.userId?.email || verification.userEmail;
      
      if (studentEmail) {
        await sendVerificationDecisionEmail(
          studentEmail,
          itemTitle,
          verification.itemType,
          decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          comment || '',
          verification.verifierName || actorEmail
        );
      }
    } catch (emailErr) {
      console.warn('Decision notification email failed:', emailErr.message || emailErr);
    }

    res.json({ ok: true, verificationId: verification._id, status: verification.status });
  } catch (error) {
    console.error('Decision error:', error);
    res.status(500).json({ message: 'Failed to process decision', error: error.message });
  }
});

module.exports = router;
