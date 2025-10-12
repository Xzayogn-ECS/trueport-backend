const express = require('express');
const CollaborationRequest = require('../models/CollaborationRequest');
const Project = require('../models/Project');
const User = require('../models/User');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

// Search users for collaboration (exclude self)
router.get('/search-users', requireAuth, async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const searchRegex = new RegExp(query.trim(), 'i');
    
    // Search by name or email, exclude current user
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { name: searchRegex },
        { email: searchRegex }
      ]
    })
    .select('name email profilePicture role')
    .limit(parseInt(limit));

    res.json({ users, count: users.length });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Failed to search users', error: error.message });
  }
});

// Send collaboration request
router.post('/request', requireAuth, async (req, res) => {
  try {
    const { projectId, requestedUserId, role, message } = req.body;

    // Validation
    if (!projectId || !requestedUserId) {
      return res.status(400).json({ message: 'Project ID and user ID are required' });
    }

    if (role && role.length > 100) {
      return res.status(400).json({ message: 'Role must be less than 100 characters' });
    }

    // Check if project exists and user is owner
    const project = await Project.findOne({ _id: projectId, userId: req.user._id });
    if (!project) {
      return res.status(404).json({ message: 'Project not found or you do not own this project' });
    }

    // Check if requested user exists
    const requestedUser = await User.findById(requestedUserId);
    if (!requestedUser) {
      return res.status(404).json({ message: 'Requested user not found' });
    }

    // Cannot invite yourself
    if (requestedUserId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot send collaboration request to yourself' });
    }

    // Check collaborator limit (max 5)
    const currentCollaborators = project.linkedCollaborators?.length || 0;
    if (currentCollaborators >= 5) {
      return res.status(400).json({ message: 'Maximum 5 collaborators allowed per project' });
    }

    // Check if user is already a collaborator
    const isAlreadyCollaborator = project.linkedCollaborators?.some(
      collab => collab.userId.toString() === requestedUserId
    );
    if (isAlreadyCollaborator) {
      return res.status(400).json({ message: 'User is already a collaborator on this project' });
    }

    // Check if pending request already exists
    const existingRequest = await CollaborationRequest.findOne({
      projectId,
      requestedUserId,
      status: 'PENDING'
    });
    if (existingRequest) {
      return res.status(400).json({ message: 'A pending request already exists for this user' });
    }

    // Create collaboration request
    const collabRequest = new CollaborationRequest({
      projectId,
      projectOwnerId: req.user._id,
      requestedUserId,
      role: role?.trim() || '',
      message: message?.trim() || ''
    });

    await collabRequest.save();
    await collabRequest.populate([
      { path: 'projectId', select: 'title description category' },
      { path: 'requestedUserId', select: 'name email profilePicture' }
    ]);

    res.status(201).json({
      message: 'Collaboration request sent successfully',
      request: collabRequest
    });
  } catch (error) {
    console.error('Send collaboration request error:', error);
    res.status(500).json({ message: 'Failed to send collaboration request', error: error.message });
  }
});

// Get incoming collaboration requests (requests sent to me)
router.get('/requests/incoming', requireAuth, async (req, res) => {
  try {
    const { status = 'PENDING', page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { requestedUserId: req.user._id };
    if (status) {
      query.status = status.toUpperCase();
    }

    const requests = await CollaborationRequest.find(query)
      .populate('projectId', 'title description category projectType')
      .populate('projectOwnerId', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await CollaborationRequest.countDocuments(query);

    res.json({
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get incoming requests error:', error);
    res.status(500).json({ message: 'Failed to fetch requests', error: error.message });
  }
});

// Get outgoing collaboration requests (requests I sent)
router.get('/requests/outgoing', requireAuth, async (req, res) => {
  try {
    const { status = 'PENDING', page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { projectOwnerId: req.user._id };
    if (status) {
      query.status = status.toUpperCase();
    }

    const requests = await CollaborationRequest.find(query)
      .populate('projectId', 'title description category projectType')
      .populate('requestedUserId', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await CollaborationRequest.countDocuments(query);

    res.json({
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get outgoing requests error:', error);
    res.status(500).json({ message: 'Failed to fetch requests', error: error.message });
  }
});

// Accept collaboration request
router.post('/requests/:requestId/accept', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.params;

    // Find the request
    const collabRequest = await CollaborationRequest.findOne({
      _id: requestId,
      requestedUserId: req.user._id,
      status: 'PENDING'
    });

    if (!collabRequest) {
      return res.status(404).json({ message: 'Request not found or already processed' });
    }

    // Get the project
    const project = await Project.findById(collabRequest.projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check collaborator limit
    const currentCollaborators = project.linkedCollaborators?.length || 0;
    if (currentCollaborators >= 5) {
      return res.status(400).json({ message: 'Project has reached maximum collaborators (5)' });
    }

    // Add user as linked collaborator
    if (!project.linkedCollaborators) {
      project.linkedCollaborators = [];
    }

    project.linkedCollaborators.push({
      userId: req.user._id,
      role: collabRequest.role,
      addedAt: new Date()
    });

    await project.save();

    // Update request status
    collabRequest.status = 'ACCEPTED';
    collabRequest.respondedAt = new Date();
    await collabRequest.save();

    await collabRequest.populate([
      { path: 'projectId', select: 'title description category' },
      { path: 'projectOwnerId', select: 'name email profilePicture' }
    ]);

    res.json({
      message: 'Collaboration request accepted',
      request: collabRequest,
      project: {
        id: project._id,
        title: project.title,
        collaboratorsCount: project.linkedCollaborators.length
      }
    });
  } catch (error) {
    console.error('Accept collaboration request error:', error);
    res.status(500).json({ message: 'Failed to accept request', error: error.message });
  }
});

// Reject collaboration request
router.post('/requests/:requestId/reject', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    // Find the request
    const collabRequest = await CollaborationRequest.findOne({
      _id: requestId,
      requestedUserId: req.user._id,
      status: 'PENDING'
    });

    if (!collabRequest) {
      return res.status(404).json({ message: 'Request not found or already processed' });
    }

    // Update request status
    collabRequest.status = 'REJECTED';
    collabRequest.respondedAt = new Date();
    collabRequest.rejectionReason = reason?.trim() || '';
    await collabRequest.save();

    await collabRequest.populate([
      { path: 'projectId', select: 'title description category' },
      { path: 'projectOwnerId', select: 'name email profilePicture' }
    ]);

    res.json({
      message: 'Collaboration request rejected',
      request: collabRequest
    });
  } catch (error) {
    console.error('Reject collaboration request error:', error);
    res.status(500).json({ message: 'Failed to reject request', error: error.message });
  }
});

// Cancel collaboration request (by project owner)
router.delete('/requests/:requestId', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.params;

    // Find and cancel the request
    const collabRequest = await CollaborationRequest.findOne({
      _id: requestId,
      projectOwnerId: req.user._id,
      status: 'PENDING'
    });

    if (!collabRequest) {
      return res.status(404).json({ message: 'Request not found or cannot be cancelled' });
    }

    collabRequest.status = 'CANCELLED';
    await collabRequest.save();

    res.json({
      message: 'Collaboration request cancelled',
      request: collabRequest
    });
  } catch (error) {
    console.error('Cancel collaboration request error:', error);
    res.status(500).json({ message: 'Failed to cancel request', error: error.message });
  }
});

// Remove collaborator from project (by project owner only)
router.delete('/projects/:projectId/collaborators/:userId', requireAuth, async (req, res) => {
  try {
    const { projectId, userId } = req.params;

    // Find project and verify ownership
    const project = await Project.findOne({ _id: projectId, userId: req.user._id });
    if (!project) {
      return res.status(404).json({ message: 'Project not found or you do not own this project' });
    }

    // Remove collaborator
    const initialLength = project.linkedCollaborators?.length || 0;
    project.linkedCollaborators = project.linkedCollaborators?.filter(
      collab => collab.userId.toString() !== userId
    ) || [];

    if (project.linkedCollaborators.length === initialLength) {
      return res.status(404).json({ message: 'Collaborator not found on this project' });
    }

    await project.save();

    res.json({
      message: 'Collaborator removed successfully',
      project: {
        id: project._id,
        title: project.title,
        collaboratorsCount: project.linkedCollaborators.length
      }
    });
  } catch (error) {
    console.error('Remove collaborator error:', error);
    res.status(500).json({ message: 'Failed to remove collaborator', error: error.message });
  }
});

// Get projects where I am a collaborator
router.get('/my-collaborations', requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const projects = await Project.find({
      'linkedCollaborators.userId': req.user._id
    })
      .populate('userId', 'name email profilePicture')
      .populate('linkedCollaborators.userId', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Project.countDocuments({
      'linkedCollaborators.userId': req.user._id
    });

    res.json({
      projects,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get collaborations error:', error);
    res.status(500).json({ message: 'Failed to fetch collaborations', error: error.message });
  }
});

// Get specific collaborated project details
router.get('/projects/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Find project where user is either owner or collaborator
    const project = await Project.findOne({
      _id: projectId,
      $or: [
        { userId: req.user._id },
        { 'linkedCollaborators.userId': req.user._id }
      ]
    })
      .populate('userId', 'name email profilePicture githubUsername')
      .populate('linkedCollaborators.userId', 'name email profilePicture');

    if (!project) {
      return res.status(404).json({ message: 'Project not found or you do not have access' });
    }

    // Check if user is a collaborator and get their role
    const userCollaboration = project.linkedCollaborators?.find(
      collab => collab.userId._id.toString() === req.user._id.toString()
    );

    const isOwner = project.userId._id.toString() === req.user._id.toString();

    res.json({
      project,
      userRole: isOwner ? 'OWNER' : (userCollaboration ? 'COLLABORATOR' : 'NONE'),
      collaboratorRole: userCollaboration?.role || null
    });
  } catch (error) {
    console.error('Get collaborated project error:', error);
    res.status(500).json({ message: 'Failed to fetch project', error: error.message });
  }
});

// Get all collaborators of a project (accessible by owner and collaborators)
router.get('/projects/:projectId/collaborators', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Find project where user is either owner or collaborator
    const project = await Project.findOne({
      _id: projectId,
      $or: [
        { userId: req.user._id },
        { 'linkedCollaborators.userId': req.user._id }
      ]
    })
      .populate('userId', 'name email profilePicture')
      .populate('linkedCollaborators.userId', 'name email profilePicture githubUsername')
      .select('title linkedCollaborators userId');

    if (!project) {
      return res.status(404).json({ message: 'Project not found or you do not have access' });
    }

    res.json({
      projectTitle: project.title,
      owner: project.userId,
      collaborators: project.linkedCollaborators || [],
      totalCollaborators: project.linkedCollaborators?.length || 0
    });
  } catch (error) {
    console.error('Get collaborators error:', error);
    res.status(500).json({ message: 'Failed to fetch collaborators', error: error.message });
  }
});

module.exports = router;
