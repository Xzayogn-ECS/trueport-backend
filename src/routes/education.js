const express = require('express');
const Education = require('../models/Education');
const Verification = require('../models/Verification');
const VerificationLog = require('../models/VerificationLog');
const User = require('../models/User');
const { generateVerificationToken } = require('../utils/jwt');
const { sendVerificationEmail } = require('../utils/email');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

// Create new education entry
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      courseType,
      courseName,
      boardOrUniversity,
      schoolOrCollege,
      passingYear,
      isExpected,
      grade,
      percentage,
      cgpa,
      description,
      attachments
    } = req.body;

    // Validation
    // boardOrUniversity is optional (school cards like NUR -> 12TH do not require a board/university)
    if (!courseType || !courseName || !schoolOrCollege || !passingYear) {
      return res.status(400).json({
        message: 'Course type, course name, school/college, and passing year are required'
      });
    }

    // Validate passing year
    const currentYear = new Date().getFullYear();
    if (passingYear < 1990 || passingYear > currentYear + 10) {
      return res.status(400).json({
        message: 'Passing year must be between 1990 and ' + (currentYear + 10)
      });
    }

    const education = new Education({
      userId: req.user._id,
      courseType: courseType.toUpperCase(),
      courseName: courseName.trim(),
      boardOrUniversity: boardOrUniversity.trim(),
      schoolOrCollege: schoolOrCollege.trim(),
      passingYear: parseInt(passingYear),
      isExpected: isExpected || false,
      grade: grade ? grade.trim() : undefined,
      percentage: percentage ? parseFloat(percentage) : undefined,
      cgpa: cgpa ? parseFloat(cgpa) : undefined,
      description: description ? description.trim() : undefined,
      attachments: attachments || []
    });

    await education.save();
    await education.populate('userId', 'name email');

    // Optionally create a verification request if requested by client
    // Client may send { requestVerification: true, verifierEmail: 'verifier@example.com' }
    let createdVerification = null;
    try {
      const { requestVerification, verifierEmail } = req.body;
      if ((requestVerification || verifierEmail) && !education.verified) {
        const verifierEmailLower = (verifierEmail || '').toLowerCase();
        if (verifierEmailLower) {
          const verifier = await User.findOne({ email: verifierEmailLower, role: 'VERIFIER' });
          if (verifier) {
            const student = await User.findById(req.user._id).select('institute name email');
            if (student && student.institute && verifier.institute && student.institute === verifier.institute) {
              const { createOrGetPendingVerification } = require('../utils/createVerification');
              const { verification, created } = await createOrGetPendingVerification({
                itemId: education._id,
                itemType: 'EDUCATION',
                verifierEmail: verifier.email,
                verifierName: verifier.name,
                verifierOrganization: verifier.institute || '',
                actorEmail: req.user.email,
                metadata: { verifierEmail: verifier.email, verifierName: verifier.name, itemType: 'EDUCATION' }
              });

              if (created) {
                try {
                  await sendVerificationEmail(verifier.email, verification.token, education.courseName || 'Education', student.name, 'EDUCATION');
                } catch (e) {
                  console.warn('Failed to send verification email for education:', e.message || e);
                }
                createdVerification = verification;
              }
            }
          }
        }
      }
    } catch (vErr) {
      console.warn('Verification creation for education failed (non-fatal):', vErr.message || vErr);
    }

    const responsePayload = {
      message: 'Education entry created successfully',
      education
    };
    if (createdVerification) {
      responsePayload.verification = {
        id: createdVerification._id,
        status: createdVerification.status,
        expiresAt: createdVerification.expiresAt
      };
    }

    res.status(201).json(responsePayload);

  } catch (error) {
    console.error('Create education error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      message: 'Failed to create education entry',
      error: error.message
    });
  }
});

// Get user's own education entries
router.get('/', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { userId: req.user._id };

    // Filter by verification status if specified
    if (req.query.verified !== undefined) {
      query.verified = req.query.verified === 'true';
    }

    // Filter by course type if specified
    if (req.query.courseType) {
      query.courseType = req.query.courseType.toUpperCase();
    }

    const educations = await Education.find(query)
      .populate('userId', 'name email')
      .sort({ passingYear: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Attach verification info for each education
    const eduIds = educations.map(e => e._id);
    const eduVerifications = await Verification.find({ itemType: 'EDUCATION', itemId: { $in: eduIds } }).sort({ createdAt: -1 });
    const eduVerMap = {};
    const now = new Date();
    for (const v of eduVerifications) {
      const key = v.itemId.toString();
      const isPendingActive = v.status === 'PENDING' && v.expiresAt && v.expiresAt > now;
      if (!eduVerMap[key]) {
        eduVerMap[key] = v;
      } else {
        const cur = eduVerMap[key];
        const curPendingActive = cur.status === 'PENDING' && cur.expiresAt && cur.expiresAt > now;
        if (!curPendingActive && isPendingActive) {
          eduVerMap[key] = v;
        }
      }
    }

    const educationsWithVerification = educations.map(ed => {
      const obj = ed.toObject();
      const v = eduVerMap[ed._id];
      if (v) {
        obj.verification = {
          id: v._id,
          status: v.status,
          verifierEmail: v.verifierEmail,
          expiresAt: v.expiresAt,
          actedAt: v.actedAt,
          comment: v.comment
        };
        obj.verificationStatus = v.status === 'PENDING' ? 'submitted' : (v.status === 'APPROVED' ? 'verified' : 'rejected');
      } else {
        obj.verificationStatus = ed.verified ? 'verified' : 'not_verified';
      }
      return obj;
    });

    const total = await Education.countDocuments(query);

    res.json({
      educations: educationsWithVerification,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get educations error:', error);
    res.status(500).json({
      message: 'Failed to fetch education entries',
      error: error.message
    });
  }
});

// Get specific education entry (public access for verification)
router.get('/:id', async (req, res) => {
  try {
    const education = await Education.findById(req.params.id)
      .populate('userId', 'name email githubUsername');

    if (!education) {
      return res.status(404).json({ message: 'Education entry not found' });
    }

    // Attach verification info if present
    const now = new Date();
    let verification = await Verification.findOne({ itemType: 'EDUCATION', itemId: education._id, status: 'PENDING', expiresAt: { $gt: now } }).sort({ createdAt: -1 });
    if (!verification) {
      verification = await Verification.findOne({ itemType: 'EDUCATION', itemId: education._id }).sort({ createdAt: -1 });
    }
    const eduObj = education.toObject();
    if (verification) {
      eduObj.verification = {
        id: verification._id,
        status: verification.status,
        verifierEmail: verification.verifierEmail,
        expiresAt: verification.expiresAt,
        actedAt: verification.actedAt,
        comment: verification.comment
      };
      eduObj.verificationStatus = verification.status === 'PENDING' ? 'submitted' : (verification.status === 'APPROVED' ? 'verified' : 'rejected');
    } else {
      eduObj.verificationStatus = education.verified ? 'verified' : 'not_verified';
    }

    res.json({ education: eduObj });

  } catch (error) {
    console.error('Get education error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid education ID' });
    }

    res.status(500).json({
      message: 'Failed to fetch education entry',
      error: error.message
    });
  }
});

// Update education entry
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const education = await Education.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!education) {
      return res.status(404).json({ message: 'Education entry not found' });
    }

    // Don't allow updates to verified education entries
    if (education.verified) {
      return res.status(400).json({
        message: 'Cannot update verified education entry'
      });
    }

    const updates = {};
    const allowedUpdates = [
      'courseType', 'courseName', 'boardOrUniversity', 'schoolOrCollege',
      'passingYear', 'isExpected', 'grade', 'percentage', 'cgpa',
      'description', 'attachments'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Validate passing year if provided
    if (updates.passingYear !== undefined) {
      const currentYear = new Date().getFullYear();
      const year = parseInt(updates.passingYear);
      if (isNaN(year) || year < 1990 || year > currentYear + 10) {
        return res.status(400).json({
          message: 'Passing year must be between 1990 and ' + (currentYear + 10)
        });
      }
      updates.passingYear = year;
    }

    // Clean and validate other fields
    if (updates.courseType) {
      updates.courseType = updates.courseType.toUpperCase();
    }

    const updatedEducation = await Education.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate('userId', 'name email');

    // Optionally create a verification request after update if requested
    let createdVerification = null;
    try {
      const { requestVerification, verifierEmail } = req.body;
      if ((requestVerification || verifierEmail) && !updatedEducation.verified) {
        const verifierEmailLower = (verifierEmail || '').toLowerCase();
        if (verifierEmailLower) {
          const verifier = await User.findOne({ email: verifierEmailLower, role: 'VERIFIER' });
          const student = await User.findById(req.user._id).select('institute name email');
          if (verifier && student && student.institute && verifier.institute && student.institute === verifier.institute) {
            const { createOrGetPendingVerification } = require('../utils/createVerification');
            const { verification, created } = await createOrGetPendingVerification({
              itemId: updatedEducation._id,
              itemType: 'EDUCATION',
              verifierEmail: verifier.email,
              verifierName: verifier.name,
              verifierOrganization: verifier.institute || '',
              actorEmail: req.user.email,
              metadata: { verifierEmail: verifier.email, verifierName: verifier.name, itemType: 'EDUCATION' }
            });

            if (created) {
              try {
                await sendVerificationEmail(verifier.email, verification.token, updatedEducation.courseName || 'Education', student.name, 'EDUCATION');
              } catch (e) {
                console.warn('Failed to send verification email for education:', e.message || e);
              }
              createdVerification = verification;
            }
          }
        }
      }
    } catch (vErr) {
      console.warn('Verification creation on education update failed (non-fatal):', vErr.message || vErr);
    }

    const responsePayload = {
      message: 'Education entry updated successfully',
      education: updatedEducation
    };
    if (createdVerification) {
      responsePayload.verification = {
        id: createdVerification._id,
        status: createdVerification.status,
        expiresAt: createdVerification.expiresAt
      };
    }

    res.json(responsePayload);

  } catch (error) {
    console.error('Update education error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: 'Validation error',
        errors: messages
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid education ID' });
    }

    res.status(500).json({
      message: 'Failed to update education entry',
      error: error.message
    });
  }
});

// Delete education entry
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const education = await Education.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!education) {
      return res.status(404).json({ message: 'Education entry not found' });
    }

    // Don't allow deletion of verified education entries
    if (education.verified) {
      return res.status(400).json({
        message: 'Cannot delete verified education entry'
      });
    }

    await Education.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Education entry deleted successfully'
    });

  } catch (error) {
    console.error('Delete education error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid education ID' });
    }

    res.status(500).json({
      message: 'Failed to delete education entry',
      error: error.message
    });
  }
});

module.exports = router;