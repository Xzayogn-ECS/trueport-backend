const express = require('express');
const Institution = require('../models/Institution');
const InstitutionClaimRequest = require('../models/InstitutionClaimRequest');
const User = require('../models/User');
const { requireAuth } = require('../middlewares/auth');
const { requireSuperAdmin } = require('../middlewares/adminAuth');

const mongoose = require('mongoose');
const router = express.Router();

// Create institution (by regular user) - Shows as unverified
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      website,
      logo,
      district,
      state,
      contactInfo,
      institutionType
    } = req.body;
    console.log(req.body);
    // Validation
    if (!name || !displayName || !contactInfo?.email || !institutionType || !district || !state) {
      return res.status(400).json({
        message: 'Institution name, display name, contact email, type, district, and state are required'
      });
    }

    // Option validation: ensure type, district, and state are valid
    const validTypes = Institution.schema.path('institutionType').enumValues;
    const selectedType = institutionType.trim().toUpperCase();
    if (!validTypes.includes(selectedType)) {
      return res.status(400).json({ message: 'Invalid institution type' });
    }
    // Check if institution already exists
    const existingInstitution = await Institution.findOne({
      name: name.trim()
    }); 

    if (existingInstitution) {
      return res.status(400).json({
        message: 'This institution already exists in the system'
      });
    }

    // Create institution with unverified status
    const institution = new Institution({
      name: name.trim(),
      displayName: displayName.trim(),
      institutionType: institutionType.trim().toUpperCase(),
      description,
      website,
      logo,
      address: { district: district.trim(), state: state.trim() },
      contactInfo: {
        email: contactInfo.email.trim().toLowerCase(),
        phone: contactInfo.phone
      },
      status: 'INACTIVE', // Inactive until admin approves
      kycVerified: false,
      createdByUser: true,
      createdBy: req.user._id,
      createdByModel: 'User'
    });

    await institution.save();

    // Add institution to user's createdInstitutions array
    await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { createdInstitutions: institution._id } }
    );

    res.status(201).json({
      message: 'Institution created successfully. It will show as unverified until admin approval.',
      institution: {
        id: institution._id,
        name: institution.name,
        displayName: institution.displayName,
        type: institution.institutionType,
        status: institution.status,
        kycVerified: institution.kycVerified,
        createdByUser: institution.createdByUser
      }
    });

  } catch (error) {
    console.error('Create institution error:', error);
    res.status(500).json({
      message: 'Failed to create institution',
      error: error.message
    });
  }
});

// Get all institutions with claimed/unclaimed status
router.get('/', async (req, res) => {
  try {
    const { search, district, state, claimed, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { status: 'ACTIVE' };

    // Filter by claimed status
    if (claimed !== undefined) {
      query.claimed = claimed === 'true';
    }

    // Add search filter
    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { displayName: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    // Add location filters
    if (district && district.trim()) {
      query['address.district'] = { $regex: district.trim(), $options: 'i' };
    }
    if (state && state.trim()) {
      query['address.state'] = { $regex: state.trim(), $options: 'i' };
    }

    const institutions = await Institution.find(query)
      .select('name displayName institutionType description website logo address contactInfo claimed claimedBy claimedAt importedFromCSV createdAt')
      .populate('claimedBy', 'name email')
      .sort({ name: 1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Institution.countDocuments(query);

    res.json({
      institutions: institutions.map(inst => ({
        id: inst._id,
        name: inst.name,
        displayName: inst.displayName,
        type: inst.institutionType,
        description: inst.description,
        website: inst.website,
        logo: inst.logo,
        address: inst.address,
        contactInfo: inst.contactInfo,
        claimed: inst.claimed,
        claimedBy: inst.claimedBy,
        claimedAt: inst.claimedAt,
        importedFromCSV: inst.importedFromCSV,
        createdAt: inst.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get institutions error:', error);
    res.status(500).json({
      message: 'Failed to fetch institutions',
      error: error.message
    });
  }
});

// Submit claim request for an institution
router.post('/:institutionId/claim', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, designation } = req.body;
    const { institutionId } = req.params;

    // Validation
    if (!name || !email || !phone || !designation) {
      return res.status(400).json({
        message: 'Name, email, phone, and designation are required'
      });
    }

    // Check if institution exists
    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return res.status(404).json({ message: 'Institution not found' });
    }

    // Check if already claimed
    if (institution.claimed) {
      return res.status(400).json({
        message: 'This institution has already been claimed'
      });
    }

    // Check if user already has a pending request for this institution
    const existingRequest = await InstitutionClaimRequest.findOne({
      institutionId,
      userId: req.user._id,
      status: 'PENDING'
    });

    if (existingRequest) {
      return res.status(400).json({
        message: 'You already have a pending claim request for this institution'
      });
    }

    // Create claim request
    const claimRequest = new InstitutionClaimRequest({
      institutionId,
      userId: req.user._id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      designation: designation.trim(),
      status: 'PENDING'
    });

    await claimRequest.save();

    res.status(201).json({
      message: 'Claim request submitted successfully. Awaiting admin approval.',
      claimRequest: {
        id: claimRequest._id,
        institutionId: institution._id,
        institutionName: institution.name,
        status: claimRequest.status,
        createdAt: claimRequest.createdAt
      }
    });

  } catch (error) {
    console.error('Submit claim request error:', error);
    res.status(500).json({
      message: 'Failed to submit claim request',
      error: error.message
    });
  }
});

// Get user's claim requests
router.get('/my-requests', requireAuth, async (req, res) => {
  try {
    const requests = await InstitutionClaimRequest.find({
      userId: req.user._id
    })
      .populate('institutionId', 'name displayName logo address')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ requests });

  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({
      message: 'Failed to fetch your claim requests',
      error: error.message
    });
  }
});

// Get my created/claimed institutions
router.get('/my-institutions', requireAuth, async (req, res) => {
  try {
    const institutions = await Institution.find({
      $or: [
        { createdBy: req.user._id, createdByUser: true },
        { claimedBy: req.user._id }
      ]
    })
      .select('name displayName institutionType description website logo address contactInfo status claimed kycVerified importedFromCSV createdAt claimedAt')
      .sort({ createdAt: -1 });

    res.json({
      institutions: institutions.map(inst => ({
        id: inst._id,
        name: inst.name,
        displayName: inst.displayName,
        type: inst.institutionType,
        description: inst.description,
        website: inst.website,
        logo: inst.logo,
        address: inst.address,
        contactInfo: inst.contactInfo,
        status: inst.status,
        claimed: inst.claimed,
        kycVerified: inst.kycVerified,
        importedFromCSV: inst.importedFromCSV,
        createdAt: inst.createdAt,
        claimedAt: inst.claimedAt
      }))
    });

  } catch (error) {
    console.error('Get my institutions error:', error);
    res.status(500).json({
      message: 'Failed to fetch your institutions',
      error: error.message
    });
  }
});

// Get specific institution details
router.get('/:institutionId', async (req, res) => {
  try {
    const { institutionId } = req.params;
    // Validate institutionId
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      return res.status(400).json({ message: 'Invalid institution ID' });
    }
    const institution = await Institution.findById(institutionId)
      .populate('createdBy', 'name email');

    if (!institution) {
      return res.status(404).json({ message: 'Institution not found' });
    }

    res.json({ institution });

  } catch (error) {
    console.error('Get institution error:', error);
    res.status(500).json({
      message: 'Failed to fetch institution',
      error: error.message
    });
  }
});

// ============== SUPER ADMIN ENDPOINTS ==============

// Get all claim requests
router.get('/admin/requests', requireSuperAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) {
      query.status = status.toUpperCase();
    }

    const requests = await InstitutionClaimRequest.find(query)
      .populate('institutionId', 'name displayName logo address')
      .populate('userId', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await InstitutionClaimRequest.countDocuments(query);

    // Get counts by status
    const statusCounts = await InstitutionClaimRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      requests,
      statusCounts: statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get claim requests error:', error);
    res.status(500).json({
      message: 'Failed to fetch claim requests',
      error: error.message
    });
  }
});

router.get('/admin/requests/:requestId', requireSuperAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }
    const claimRequest = await InstitutionClaimRequest.findById(requestId)
      .populate('institutionId', 'name displayName logo address')
      .populate('userId', 'name email phone')
      .populate('reviewedBy', 'name email');
    if (!claimRequest) {
      return res.status(404).json({ message: 'Claim request not found' });
    }
    res.json({ claimRequest });
  } catch (error) {
    console.error('Get claim request detail error:', error);
    res.status(500).json({ message: 'Failed to fetch claim request details', error: error.message });
  }
});


// Approve claim request (simple - just marks institution as claimed)
router.post('/admin/requests/:requestId/approve', requireSuperAdmin, async (req, res) => {
  try {
    const claimRequest = await InstitutionClaimRequest.findById(req.params.requestId)
      .populate('institutionId')
      .populate('userId', 'name email');

    if (!claimRequest) {
      return res.status(404).json({ message: 'Claim request not found' });
    }

    if (claimRequest.status !== 'PENDING') {
      return res.status(400).json({
        message: 'This claim request has already been processed'
      });
    }

    const institution = claimRequest.institutionId;

    if (institution.claimed) {
      return res.status(400).json({
        message: 'This institution has already been claimed'
      });
    }

    // Update institution as claimed
    institution.claimed = true;
    institution.claimedBy = claimRequest.userId;
    institution.claimedAt = new Date();
    await institution.save();

    // Update claim request status
    claimRequest.status = 'APPROVED';
    claimRequest.reviewedBy = req.admin._id;
    claimRequest.reviewedAt = new Date();
    await claimRequest.save();

    // TODO: Send email notification to user

    res.json({
      message: 'Claim request approved successfully. Institution is now marked as claimed.',
      institution: {
        id: institution._id,
        name: institution.name,
        claimed: institution.claimed,
        claimedBy: {
          id: claimRequest.userId._id,
          name: claimRequest.userId.name,
          email: claimRequest.userId.email
        }
      }
    });

  } catch (error) {
    console.error('Approve claim request error:', error);
    res.status(500).json({
      message: 'Failed to approve claim request',
      error: error.message
    });
  }
});

// Reject claim request
router.post('/admin/requests/:requestId/reject', requireSuperAdmin, async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const claimRequest = await InstitutionClaimRequest.findById(req.params.requestId)
      .populate('institutionId', 'name displayName')
      .populate('userId', 'name email');

    if (!claimRequest) {
      return res.status(404).json({ message: 'Claim request not found' });
    }

    if (claimRequest.status !== 'PENDING') {
      return res.status(400).json({
        message: 'This claim request has already been processed'
      });
    }

    // Update claim request status
    claimRequest.status = 'REJECTED';
    claimRequest.reviewedBy = req.admin._id;
    claimRequest.reviewedAt = new Date();
    claimRequest.rejectionReason = rejectionReason;
    await claimRequest.save();

    // TODO: Send email notification to user about rejection

    res.json({
      message: 'Claim request rejected successfully',
      claimRequest: {
        id: claimRequest._id,
        institutionName: claimRequest.institutionId.name,
        status: claimRequest.status,
        rejectionReason: claimRequest.rejectionReason
      }
    });

  } catch (error) {
    console.error('Reject claim request error:', error);
    res.status(500).json({
      message: 'Failed to reject claim request',
      error: error.message
    });
  }
});

// Get options for institution creation (districts, states, types)
router.get('/options', async (req, res) => {
  try {
    // Get distinct districts and states
    const districts = await Institution.distinct('address.district');
    const states = await Institution.distinct('address.state');
    // Get enum values for institutionType
    const types = Institution.schema.path('institutionType').enumValues;
    res.json({ districts, states, types });
  } catch (error) {
    console.error('Get institution options error:', error);
    res.status(500).json({ message: 'Failed to fetch institution options', error: error.message });
  }
});

module.exports = router;
