const express = require('express');
const Event = require('../models/Event');
const User = require('../models/User');
const Experience = require('../models/Experience');
const { requireInstituteAdmin } = require('../middlewares/adminAuth');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

// Helper: shape role arrays so each entry has userId, userName, userEmail, assignedAt
const shapeEventRoles = (eventDoc) => {
  if (!eventDoc) return eventDoc;
  // Ensure plain object
  const ev = eventDoc.toObject ? eventDoc.toObject() : JSON.parse(JSON.stringify(eventDoc));

  const mapEntries = (arr) => (arr || []).map(entry => {
    const uid = entry.userId || {};
    const id = uid._id ? uid._id : uid;
    return {
      userId: id,
      userName: uid.name || uid.userName || null,
      userEmail: uid.email || uid.userEmail || null,
      assignedAt: entry.assignedAt || null
    };
  });

  ev.coordinators = mapEntries(ev.coordinators);
  ev.inCharges = mapEntries(ev.inCharges);
  ev.judges = mapEntries(ev.judges);

  return ev;
};

// Middleware to check if user is verifier (teacher/faculty)
const requireVerifier = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    if (user.role !== 'VERIFIER') {
      return res.status(403).json({ message: 'Access denied. Verifier role required.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Verifier auth error:', error);
    res.status(401).json({ message: 'Authentication error.' });
  }
};

// Middleware that allows either institute admin or verifier
const requireAdminOrVerifier = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if it's an admin token
    if (decoded.adminType === 'INSTITUTE_ADMIN') {
      const InstituteAdmin = require('../models/InstituteAdmin');
      const admin = await InstituteAdmin.findById(decoded.adminId);
      
      if (!admin || !admin.isActive) {
        return res.status(401).json({ message: 'Invalid token or inactive account.' });
      }
      
      req.admin = admin;
      req.userType = 'INSTITUTE_ADMIN';
      return next();
    }
    
    // Check if it's a verifier (user) token
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    
    if (user.role !== 'VERIFIER') {
      return res.status(403).json({ message: 'Access denied. Admin or Verifier role required.' });
    }
    
    req.user = user;
    req.userType = 'VERIFIER';
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ message: 'Authentication error.' });
  }
};

// Create a new event
router.post('/', requireAdminOrVerifier, async (req, res) => {
  try {
    const {
      title,
      description,
      eventType,
      organizer,
      startDate,
      endDate,
      location,
      tags,
      attachments,
      awards,
      status,
      isPublic
    } = req.body;

    // Validate required fields
    if (!title || !description || !eventType || !startDate) {
      return res.status(400).json({
        message: 'Title, description, event type, and start date are required'
      });
    }

    // Determine institution and creator
    let institution, creatorData;
    
    if (req.userType === 'INSTITUTE_ADMIN') {
      institution = req.admin.institution;
      creatorData = {
        adminId: req.admin._id,
        adminType: 'INSTITUTE_ADMIN',
        name: req.admin.name,
        email: req.admin.email
      };
    } else {
      institution = req.user.institute;
      creatorData = {
        adminId: req.user._id,
        adminType: 'VERIFIER',
        name: req.user.name,
        email: req.user.email
      };
    }

    // If caller is a verifier (not institute admin), they must be allowed to create events as coordinator
    if (req.userType === 'VERIFIER') {
      // Verifier can create events (Coordinator Access) — allowed globally for verifiers in this system
      // If you want to restrict to assigned coordinators only, adjust here to check assignment
    }

    const event = new Event({
      title,
      description,
      eventType,
      institution,
      organizer: organizer || { name: creatorData.name, email: creatorData.email },
      startDate,
      endDate,
      location,
      tags: tags || [],
      attachments: attachments || [],
      awards: awards || [],
      createdBy: creatorData,
      status: status || 'DRAFT',
      isPublic: isPublic !== undefined ? isPublic : true
    });

    await event.save();

    res.status(201).json({
      message: 'Event created successfully',
      event
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      message: 'Failed to create event',
      error: error.message
    });
  }
});

// Get all events (for admin/verifier - includes drafts)
router.get('/', requireAdminOrVerifier, async (req, res) => {
  try {
    const { status, eventType, page = 1, limit = 20, search } = req.query;
    
    // Determine institution
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    const query = { institution };

    if (status) {
      query.status = status;
    }

    if (eventType) {
      query.eventType = eventType;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const events = await Event.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
  .populate('participants.userId', 'name email')
  .populate('coordinators.userId', 'name email')
  .populate('inCharges.userId', 'name email')
  .populate('judges.userId', 'name email')
      .exec();

    const count = await Event.countDocuments(query);

    // Shape role fields for each event
    const shapedEvents = events.map(e => shapeEventRoles(e));

    res.json({
      events: shapedEvents,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalEvents: count
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      message: 'Failed to fetch events',
      error: error.message
    });
  }
});

// Get single event by ID
router.get('/:eventId', requireAdminOrVerifier, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId)
  .populate('participants.userId', 'name email institute')
      .populate('participants.experienceId')
  .populate('coordinators.userId', 'name email')
  .populate('inCharges.userId', 'name email')
  .populate('judges.userId', 'name email');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user has access to this event (same institution)
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

  res.json({ event: shapeEventRoles(event) });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({
      message: 'Failed to fetch event',
      error: error.message
    });
  }
});

// Update an event
router.put('/:eventId', requireAdminOrVerifier, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user has access to this event
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

    // Update allowed fields
    const allowedUpdates = [
      'title', 'description', 'eventType', 'organizer', 'startDate', 
      'endDate', 'location', 'tags', 'attachments', 'awards', 'status', 'isPublic'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        event[field] = req.body[field];
      }
    });

    event.updatedAt = new Date();
    await event.save();

    res.json({
      message: 'Event updated successfully',
      event
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      message: 'Failed to update event',
      error: error.message
    });
  }
});

// Delete an event
router.delete('/:eventId', requireAdminOrVerifier, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user has access to this event
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

    // Only institute admin or a coordinator (assigned) may delete event
    if (req.userType === 'VERIFIER') {
      if (!event.isCoordinator(req.user._id)) {
        return res.status(403).json({ message: 'Only assigned coordinators or institute admins can delete events' });
      }
    }

    await Event.findByIdAndDelete(req.params.eventId);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      message: 'Failed to delete event',
      error: error.message
    });
  }
});

// Add participants to an event
router.post('/:eventId/participants', requireAdminOrVerifier, async (req, res) => {
  try {
    const { participants } = req.body; // Array of { userId, role, position, teamName, certificate }

    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        message: 'Participants array is required and must not be empty'
      });
    }

    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user has access to this event
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

    // If caller is a verifier, ensure they are coordinator or in-charge for this event
    if (req.userType === 'VERIFIER') {
      const callerId = req.user._id;
      if (!event.isCoordinator(callerId) && !event.isInCharge(callerId)) {
        return res.status(403).json({ message: 'Only coordinators or in-charges may add participants' });
      }
    }

    // Validate and add each participant
    const addedParticipants = [];
    const errors = [];

    for (const participant of participants) {
      try {
        if (!participant.userId) {
          errors.push({ participant, error: 'userId is required' });
          continue;
        }

        // Check if user exists and belongs to same institution
        const user = await User.findById(participant.userId);
        
        if (!user) {
          errors.push({ participant, error: 'User not found' });
          continue;
        }

        if (user.institute !== institution) {
          errors.push({ participant, error: 'User does not belong to your institution' });
          continue;
        }

        // Add participant to event
        event.addParticipant({
          userId: participant.userId,
          role: participant.role || 'Participant',
          position: participant.position || '',
          teamName: participant.teamName || '',
          certificate: participant.certificate || ''
        });

        addedParticipants.push(participant.userId);
      } catch (err) {
        errors.push({ participant, error: err.message });
      }
    }

  await event.save();

    res.json({
      message: 'Participants processed',
      addedCount: addedParticipants.length,
      added: addedParticipants,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Add participants error:', error);
    res.status(500).json({
      message: 'Failed to add participants',
      error: error.message
    });
  }
});

// Assign or unassign roles: coordinator, inCharge, judge
router.post('/:eventId/assign/:role', requireAdminOrVerifier, async (req, res) => {
  try {
    const { role } = req.params; // coordinator | inCharge | judge
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Only institute admin or verifier may assign roles
    // (requireAdminOrVerifier already validated token)

    // Ensure user exists and is a verifier
    const target = await User.findById(userId);
    if (!target || target.role !== 'VERIFIER') return res.status(400).json({ message: 'Target user must be a registered verifier' });

    // Ensure same institution
    const institution = req.userType === 'INSTITUTE_ADMIN' ? req.admin.institution : req.user.institute;
    if (target.institute !== institution) return res.status(403).json({ message: 'Target user must belong to your institution' });

    const entry = { userId: target._id };

    // Permission enforcement:
    // - Assigning 'coordinator' can only be done by an Institute Admin
    // - Assigning 'inCharge' or 'judge' can be done by Institute Admin or an assigned Coordinator of the event
    if (req.userType === 'VERIFIER') {
      // Caller is a verifier (not an institute admin)
      if (role === 'coordinator') {
        return res.status(403).json({ message: 'Only institute admins may assign coordinators' });
      }

      // For inCharge/judge, the caller must be an assigned coordinator on this event
      const callerId = req.user._id;
      if (!event.isCoordinator(callerId)) {
        return res.status(403).json({ message: 'Only assigned coordinators or institute admins may assign this role' });
      }
    }

    // Prevent assigning the same user to multiple roles for the same event
    const alreadyCoordinator = event.coordinators.some(c => c.userId.toString() === userId);
    const alreadyInCharge = event.inCharges.some(c => c.userId.toString() === userId);
    const alreadyJudge = event.judges.some(c => c.userId.toString() === userId);

    // Helper to disallow cross-role assignment
    const isAssignedDifferentRole = (desiredRole) => {
      if (desiredRole === 'coordinator') return alreadyInCharge || alreadyJudge;
      if (desiredRole === 'inCharge') return alreadyCoordinator || alreadyJudge;
      if (desiredRole === 'judge') return alreadyCoordinator || alreadyInCharge;
      return false;
    };

    if (!['coordinator', 'inCharge', 'judge'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    if (isAssignedDifferentRole(role)) {
      return res.status(400).json({ message: 'User already has a different role for this event' });
    }

    // Idempotent add: only push if not already in this role
    if (role === 'coordinator') {
      if (!alreadyCoordinator) event.coordinators.push(entry);
    } else if (role === 'inCharge') {
      if (!alreadyInCharge) event.inCharges.push(entry);
    } else if (role === 'judge') {
      if (!alreadyJudge) event.judges.push(entry);
    }

  await event.save();
  // Populate role user info for response
  await event.populate('coordinators.userId', 'name email');
  await event.populate('inCharges.userId', 'name email');
  await event.populate('judges.userId', 'name email');

  res.json({ message: `${role} assigned`, event: shapeEventRoles(event) });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ message: 'Failed to assign role', error: error.message });
  }
});

router.delete('/:eventId/assign/:role', requireAdminOrVerifier, async (req, res) => {
  try {
    const { role } = req.params;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Permission enforcement for unassign:
    // - Unassigning 'coordinator' only by Institute Admin
    // - Unassigning 'inCharge'/'judge' by Institute Admin or assigned Coordinator
    if (!['coordinator', 'inCharge', 'judge'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    if (req.userType === 'VERIFIER') {
      const callerId = req.user._id;
      if (role === 'coordinator') {
        return res.status(403).json({ message: 'Only institute admins may unassign coordinators' });
      }
      // For inCharge/judge, require caller be a coordinator for this event
      if (!event.isCoordinator(callerId)) {
        return res.status(403).json({ message: 'Only assigned coordinators or institute admins may unassign this role' });
      }
    }

    if (role === 'coordinator') {
      event.coordinators = event.coordinators.filter(c => c.userId.toString() !== userId);
    } else if (role === 'inCharge') {
      event.inCharges = event.inCharges.filter(c => c.userId.toString() !== userId);
    } else if (role === 'judge') {
      event.judges = event.judges.filter(c => c.userId.toString() !== userId);
    }

  await event.save();
  // Populate role user info for response
  await event.populate('coordinators.userId', 'name email');
  await event.populate('inCharges.userId', 'name email');
  await event.populate('judges.userId', 'name email');

  res.json({ message: `${role} unassigned`, event: shapeEventRoles(event) });
  } catch (error) {
    console.error('Unassign role error:', error);
    res.status(500).json({ message: 'Failed to unassign role', error: error.message });
  }
});

// Remove participant from an event
router.delete('/:eventId/participants/:userId', requireAdminOrVerifier, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user has access to this event
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

    // Only institute admin, coordinator, or inCharge can remove participants
    if (req.userType === 'VERIFIER') {
      const callerId = req.user._id;
      if (!event.isCoordinator(callerId) && !event.isInCharge(callerId)) {
        return res.status(403).json({ message: 'Only coordinators or in-charges may remove participants' });
      }
    }

    if (!event.isParticipant(req.params.userId)) {
      return res.status(404).json({ message: 'Participant not found in event' });
    }

    event.removeParticipant(req.params.userId);
    await event.save();

    res.json({ message: 'Participant removed successfully' });
  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(500).json({
      message: 'Failed to remove participant',
      error: error.message
    });
  }
});

// Push experiences to all participants (or selected ones)
router.post('/:eventId/push-experiences', requireAdminOrVerifier, async (req, res) => {
  try {
    const { 
      userIds, // Optional: specific users to push to. If not provided, pushes to all participants
      customDescription, // Optional: override default description
      customRole // Optional: override participant role
    } = req.body;

    const event = await Event.findById(req.params.eventId)
      .populate('participants.userId', 'name email institute associationType');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user has access to this event
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution   
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

    // If caller is a verifier, ensure they are coordinator or in-charge for this event
    if (req.userType === 'VERIFIER') {
      const callerId = req.user._id;
      if (!event.isCoordinator(callerId)) {
        return res.status(403).json({ message: 'Only coordinators may push experiences' });
      }
    }

  // Determine which participants to push experiences to
  let targetParticipants = event.participants;
    
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      targetParticipants = event.participants.filter(p => 
        userIds.includes(p.userId._id.toString())
      );
    }

    if (targetParticipants.length === 0) {
      return res.status(400).json({ message: 'No participants to push experiences to' });
    }

    // Enforce: only ACTIVE association members should receive pushed experiences
    const beforeCount = targetParticipants.length;
    targetParticipants = targetParticipants.filter(p => p.userId && p.userId.associationType === 'ACTIVE');

    if (targetParticipants.length === 0) {
      return res.status(400).json({ message: 'No active participants to push experiences to' });
    }

    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    // Get creator name for verification
    const verifierName = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.name 
      : req.user.name;

    for (const participant of targetParticipants) {
      try {
        // Skip if experience already created
        if (participant.experienceCreated && participant.experienceId) {
          results.skipped.push({
            userId: participant.userId._id,
            name: participant.userId.name,
            reason: 'Experience already exists',
            experienceId: participant.experienceId
          });
          continue;
        }

        // Build description
        let description = customDescription || event.description;
        
        if (participant.position) {
          description += `\n\nPosition/Award: ${participant.position}`;
        }

        // Include structured award info if available
        if (participant.award && participant.award.rank) {
          const rankLabel = `${participant.award.rank}${['st', 'nd', 'rd'][participant.award.rank - 1] || 'th'}`;
          description += `\n\nAward: ${rankLabel} Place`;
          if (participant.award.label) {
            description += ` - ${participant.award.label}`;
          }
        }
        
        if (participant.teamName) {
          description += `\n\nTeam: ${participant.teamName}`;
        }

        // Build role
        let role = customRole || participant.role || 'Participant';
        
        // Enhance role with award label if available
        if (participant.award && participant.award.label && !role.includes(participant.award.label)) {
          role = `${participant.award.label} - ${role}`;
        } else if (participant.position && !role.includes(participant.position)) {
          role = `${participant.position} - ${role}`;
        }

        // Create experience
        // Use participant's institute from User DB as organization
        const organization = participant.userId.institute || '';

        const experience = new Experience({
          userId: participant.userId._id,
          title: event.title,
          description: description,
          organization,
          // keep role if frontend uses it elsewhere (ignored by schema if strict)
          role: role,
          startDate: event.startDate,
          endDate: event.endDate || event.startDate,
          tags: event.tags || [],
          attachments: participant.certificate 
            ? [participant.certificate, ...event.attachments]
            : event.attachments,
          verified: true, // Auto-verified by institute admin/verifier
          verifiedAt: new Date(),
          verifiedBy: verifierName,
          verifierComment: `Auto-verified: Created from institutional event "${event.title}"`,
          isPublic: event.isPublic
        });

        await experience.save();

        // Update participant record in event
        const participantIndex = event.participants.findIndex(
          p => p.userId._id.toString() === participant.userId._id.toString()
        );
        
        if (participantIndex >= 0) {
          event.participants[participantIndex].experienceCreated = true;
          event.participants[participantIndex].experienceId = experience._id;
        }

        results.success.push({
          userId: participant.userId._id,
          name: participant.userId.name,
          experienceId: experience._id
        });

      } catch (err) {
        console.error(`Failed to create experience for user ${participant.userId._id}:`, err);
        results.failed.push({
          userId: participant.userId._id,
          name: participant.userId.name,
          error: err.message
        });
      }
    }

    // Update event statistics
    event.experiencesPushedCount = results.success.length;
    event.experiencesPushedAt = new Date();
    await event.save();

    res.json({
      message: 'Experiences push completed',
      results: {
        total: targetParticipants.length,
        success: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      },
      details: results
    });

  } catch (error) {
    console.error('Push experiences error:', error);
    res.status(500).json({
      message: 'Failed to push experiences',
      error: error.message
    });
  }
});

// Assign position/rank/award to a participant
router.post('/:eventId/assign-position', requireAdminOrVerifier, async (req, res) => {
  try {
    const { userId, rank, label } = req.body;

    if (!userId) return res.status(400).json({ message: 'userId is required' });
    if (rank === undefined || rank === null) return res.status(400).json({ message: 'rank is required' });

    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Check institution access
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

    // Permission check: only institute admin, judges, or coordinators can assign positions
    // Note: In-Charge users are NOT allowed to assign awards/positions
    if (req.userType === 'VERIFIER') {
      const callerId = req.user._id;
      if (!event.isJudge(callerId) && !event.isCoordinator(callerId)) {
        return res.status(403).json({ message: 'Only judges or coordinators may assign positions' });
      }
    }

    // Find participant
    const participantIndex = event.participants.findIndex(p => p.userId.toString() === userId);
    if (participantIndex < 0) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    const assignerId = req.userType === 'INSTITUTE_ADMIN' ? req.admin._id : req.user._id;

    // Assign award
    event.participants[participantIndex].award = {
      rank: parseInt(rank),
      label: label || '',
      assignedBy: assignerId,
      assignedAt: new Date()
    };

    await event.save();

    res.json({
      message: 'Position assigned successfully',
      participant: event.participants[participantIndex]
    });
  } catch (error) {
    console.error('Assign position error:', error);
    res.status(500).json({ message: 'Failed to assign position', error: error.message });
  }
});

// Remove position/award from a participant
router.delete('/:eventId/assign-position/:userId', requireAdminOrVerifier, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Check institution access
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

    // Permission check: only institute admin, judges, coordinators, or in-charges can remove positions
    if (req.userType === 'VERIFIER') {
      const callerId = req.user._id;
      if (!event.isJudge(callerId) && !event.isCoordinator(callerId) && !event.isInCharge(callerId)) {
        return res.status(403).json({ message: 'Only judges, coordinators, or in-charges may remove positions' });
      }
    }

    // Find and remove award
    const participantIndex = event.participants.findIndex(p => p.userId.toString() === req.params.userId);
    if (participantIndex < 0) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    event.participants[participantIndex].award = undefined;
    await event.save();

    res.json({ message: 'Position removed successfully' });
  } catch (error) {
    console.error('Remove position error:', error);
    res.status(500).json({ message: 'Failed to remove position', error: error.message });
  }
});

// Get all participants with rankings sorted by rank
router.get('/:eventId/rankings', requireAdminOrVerifier, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId)
      .populate('participants.userId', 'name email profilePicture')
      .populate('participants.award.assignedBy', 'name');

    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Check institution access
    const institution = req.userType === 'INSTITUTE_ADMIN' 
      ? req.admin.institution 
      : req.user.institute;

    if (event.institution !== institution) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }

    // Filter and sort participants by rank
    const rankings = event.participants
      .filter(p => p.award && p.award.rank)
      .sort((a, b) => a.award.rank - b.award.rank)
      .map(p => ({
        rank: p.award.rank,
        label: p.award.label || 'Awardee',
        userId: p.userId._id,
        userName: p.userId.name,
        userEmail: p.userId.email,
        profilePicture: p.userId.profilePicture,
        assignedBy: p.award.assignedBy?.name || 'Unknown',
        assignedAt: p.award.assignedAt
      }));

    res.json({
      eventId: event._id,
      eventTitle: event.title,
      totalParticipants: event.participants.length,
      rankedParticipants: rankings.length,
      rankings
    });
  } catch (error) {
    console.error('Get rankings error:', error);
    res.status(500).json({ message: 'Failed to fetch rankings', error: error.message });
  }
});

// Get public events for students (read-only)
router.get('/public/list', requireAuth, async (req, res) => {
  try {
    const { eventType, page = 1, limit = 20, search } = req.query;

    const query = {
      institution: req.user.institute,
      status: 'PUBLISHED',
      isPublic: true
    };

    if (eventType) {
      query.eventType = eventType;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const events = await Event.find(query)
      .sort({ startDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-participants') // Don't show participant details to all students
      .exec();

    const count = await Event.countDocuments(query);

    res.json({
      events,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalEvents: count
    });
  } catch (error) {
    console.error('Get public events error:', error);
    res.status(500).json({
      message: 'Failed to fetch events',
      error: error.message
    });
  }
});

// Get student's own events (where they are participants)
router.get('/my/events', requireAuth, async (req, res) => {
  try {
    const events = await Event.find({
      'participants.userId': req.user._id,
      institution: req.user.institute
    })
      .sort({ startDate: -1 })
      .select('title description eventType startDate endDate location tags participants.$')
      .exec();

    res.json({ events });
  } catch (error) {
    console.error('Get my events error:', error);
    res.status(500).json({
      message: 'Failed to fetch your events',
      error: error.message
    });
  }
});

module.exports = router;
