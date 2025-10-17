const express = require('express');
const Event = require('../models/Event');
const User = require('../models/User');
const Experience = require('../models/Experience');
const { requireInstituteAdmin } = require('../middlewares/adminAuth');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

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
      .populate('participants.userId', 'name email profilePicture')
      .exec();

    const count = await Event.countDocuments(query);

    res.json({
      events,
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
      .populate('participants.userId', 'name email profilePicture institute')
      .populate('participants.experienceId');

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

    res.json({ event });
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
      .populate('participants.userId', 'name email institute');

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
        
        if (participant.teamName) {
          description += `\n\nTeam: ${participant.teamName}`;
        }

        // Build role
        let role = customRole || participant.role || 'Participant';
        
        if (participant.position && !role.includes(participant.position)) {
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
