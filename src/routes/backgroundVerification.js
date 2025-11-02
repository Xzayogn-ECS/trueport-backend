const express = require('express');
const mongoose = require('mongoose');
const BackgroundVerification = require('../models/BackgroundVerification');
const User = require('../models/User');
const BackgroundVerificationChat = require('../models/BackgroundVerificationChat');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

// Middleware to ensure user is a verifier
const requireVerifier = (req, res, next) => {
  if (req.user.role !== 'VERIFIER') {
    return res.status(403).json({
      message: 'Access denied. Verifier role required.'
    });
  }
  next();
};

// 1) Verifier: Search for students to verify (by name, institute, etc)
router.get('/search', requireAuth, requireVerifier, async (req, res) => {
  try {
    const { id, userId, name, institute, page = 1, limit = 10, role = 'STUDENT' } = req.query;
    const verifier = req.user;

    if (!verifier.institute) {
      return res.status(400).json({
        message: 'Verifier must have an associated institute'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build search query
    // NOTE: show students from all institutes (including verifier's own institute)
    const searchQuery = {
      role: role || 'STUDENT'
    };

    // Allow searching directly by MongoDB ObjectId (user id)
    const lookupId = id || userId;
    if (lookupId) {
      if (!mongoose.Types.ObjectId.isValid(lookupId)) {
        return res.status(400).json({ message: 'Invalid user id' });
      }
      // Use the string id; Mongoose will cast it to ObjectId when querying.
      searchQuery._id = lookupId;
    }

    if (name) {
      searchQuery.$or = [
        { name: { $regex: name, $options: 'i' } },
        { email: { $regex: name, $options: 'i' } }
      ];
    }

    if (institute) {
      // Filter by institute name (regex) when provided — do NOT exclude the verifier's institute
      searchQuery.institute = { $regex: institute, $options: 'i' };
    }

    const [students, total] = await Promise.all([
      User.find(searchQuery)
        .select('name email institute profilePicture bio profileJson createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(searchQuery)
    ]);

    // Check if verifier already has a pending/active verification request with any of these students
    const studentIds = students.map(s => s._id);
    const existingRequests = await BackgroundVerification.find({
      verifierId: verifier._id,
      studentId: { $in: studentIds },
      status: { $in: ['PENDING', 'SUBMITTED', 'IN_REVIEW'] }
    }).select('studentId status');

    const requestedStudentIds = existingRequests.map(req => req.studentId.toString());

    const formattedStudents = students.map(student => ({
      id: student._id,
      name: student.name,
      email: student.email,
      institute: student.institute,
      profilePicture: student.profilePicture,
      bio: student.bio,
      joinedAt: student.createdAt,
      hasActiveRequest: requestedStudentIds.includes(student._id.toString())
    }));

    res.json({
      students: formattedStudents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Search students error:', error);
    res.status(500).json({
      message: 'Failed to search students',
      error: error.message
    });
  }
});

router.post('/request', requireAuth, requireVerifier, async (req, res) => {
  try {
    const { studentId, refereeContactsRequested, notes } = req.body;
    const verifier = req.user;

    if (!studentId) {
      return res.status(400).json({
        message: 'studentId is required'
      });
    }

    if (!verifier.institute) {
      return res.status(400).json({
        message: 'Verifier must have an associated institute'
      });
    }

    // Fetch the student
    const student = await User.findById(studentId).select('name email institute _id');
    if (!student) {
      return res.status(404).json({
        message: 'Student not found'
      });
    }

    // Verify student is from a different institute
    if (student.institute === verifier.institute) {
      return res.status(400).json({
        message: 'Cannot request background verification for students from the same institute'
      });
    }

    // Check for existing pending/active verification request
    const existingRequest = await BackgroundVerification.findOne({
      studentId,
      verifierId: verifier._id,
      status: { $in: ['PENDING', 'SUBMITTED', 'IN_REVIEW'] }
    });

    if (existingRequest) {
      return res.status(400).json({
        message: 'You already have an active background verification request for this student'
      });
    }

    // Validate refereeContactsRequested (allow 1, 2 or 3 referees)
    const numRefs = refereeContactsRequested || 3;
    if (numRefs < 1 || numRefs > 3) {
      return res.status(400).json({
        message: 'Number of referee contacts must be between 1 and 3'
      });
    }

    // Create the background verification request
    const bgVerification = new BackgroundVerification({
      studentId,
      studentName: student.name,
      studentEmail: student.email,
      studentInstitute: student.institute,
      verifierId: verifier._id,
      verifierName: verifier.name,
      verifierEmail: verifier.email,
      verifierInstitute: verifier.institute,
      refereeContactsRequested: numRefs,
      notes: notes ? notes.trim() : undefined
    });

    await bgVerification.save();

    // Create chat sessions between requesting verifier and any shared contact
    // if the shared contact is an on-platform verifier user.
    try {
      const chatCreates = bgVerification.refereeContacts.map(async ref => {
        const sharedUser = await User.findOne({ email: ref.email.toLowerCase().trim(), role: 'VERIFIER' }).select('_id email name');
        if (!sharedUser) return null; // skip if referee is not a platform verifier

        return BackgroundVerificationChat.findOrCreateChat(
          bgVerification._id,
          bgVerification.verifierId,
          bgVerification.verifierEmail,
          sharedUser._id,
          sharedUser.email,
          bgVerification.studentId,
          bgVerification.studentEmail
        );
      });

      await Promise.all(chatCreates);
    } catch (chatErr) {
      console.error('Error creating chat sessions for background verification:', chatErr);
      // Do not fail the request if chats couldn't be created; just log
    }

    // Send notification to student that a verifier has requested background verification
    try {
      const { sendBGVerificationRequestToStudent } = require('../utils/email');
      await sendBGVerificationRequestToStudent(
        student.email,
        student.name,
        verifier.name,
        verifier.institute,
        numRefs
      );
    } catch (emailErr) {
      console.warn('Failed to send BG verification notification to student:', emailErr);
    }

    res.status(201).json({
      message: 'Background verification request created successfully',
      request: {
        id: bgVerification._id,
        studentName: student.name,
        studentEmail: student.email,
        studentInstitute: student.institute,
        refereeContactsRequested: numRefs,
        status: 'PENDING',
        requestedAt: bgVerification.requestedAt,
        expiresAt: bgVerification.expiresAt
      }
    });

  } catch (error) {
    console.error('Create background verification request error:', error);
    res.status(500).json({
      message: 'Failed to create background verification request',
      error: error.message
    });
  }
});

// 3) Student: Get pending background verification requests and submit referee contacts
router.get('/my-requests', requireAuth, async (req, res) => {
  try {
    const student = req.user;

    if (student.role !== 'STUDENT') {
      return res.status(403).json({
        message: 'Only students can view their background verification requests'
      });
    }

    const requests = await BackgroundVerification.findPendingForStudent(student._id);

    const formattedRequests = requests.map(req => ({
      id: req._id,
      verifier: {
        id: req.verifierId._id,
        name: req.verifierName,
        email: req.verifierEmail,
        institute: req.verifierId.institute
      },
      refereeContactsRequested: req.refereeContactsRequested,
      refereeContactsSubmitted: req.refereeContacts.length,
      status: req.status,
      requestedAt: req.requestedAt,
      submittedAt: req.submittedAt,
      expiresAt: req.expiresAt,
      notes: req.notes
    }));

    res.json({
      requests: formattedRequests,
      pendingCount: formattedRequests.length
    });

  } catch (error) {
    console.error('Get student background verification requests error:', error);
    res.status(500).json({
      message: 'Failed to fetch background verification requests',
      error: error.message
    });
  }
});

// 4) Student: Submit referee contacts for a background verification request
router.post('/:requestId/submit-references', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { refereeContacts } = req.body; // Array of { name, email, phone, role }
    const student = req.user;

    if (student.role !== 'STUDENT') {
      return res.status(403).json({
        message: 'Only students can submit referee contacts'
      });
    }

    if (!refereeContacts || !Array.isArray(refereeContacts)) {
      return res.status(400).json({
        message: 'refereeContacts must be an array'
      });
    }

    // Fetch the request
    const bgVerification = await BackgroundVerification.findById(requestId);
    if (!bgVerification) {
      return res.status(404).json({
        message: 'Background verification request not found'
      });
    }

    // Verify student ownership
    if (bgVerification.studentId.toString() !== student._id.toString()) {
      return res.status(403).json({
        message: 'This request does not belong to you'
      });
    }

    // Verify status is PENDING
    if (bgVerification.status !== 'PENDING') {
      return res.status(400).json({
        message: `Cannot submit references for a request in ${bgVerification.status} status`
      });
    }

    // Validate referee count
    if (refereeContacts.length < bgVerification.refereeContactsRequested) {
      return res.status(400).json({
        message: `You must provide at least ${bgVerification.refereeContactsRequested} referee contacts`
      });
    }

    // Validate each referee contact
    for (const ref of refereeContacts) {
      if (!ref.name || !ref.email || !ref.phone) {
        return res.status(400).json({
          message: 'Each referee must have name, email, and phone'
        });
      }
      // Validate email format
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      if (!emailRegex.test(ref.email)) {
        return res.status(400).json({
          message: `Invalid email format for referee: ${ref.email}`
        });
      }
    }

    // Update the background verification with referee contacts
    bgVerification.refereeContacts = refereeContacts.map(ref => ({
      name: ref.name.trim(),
      email: ref.email.toLowerCase().trim(),
      phone: ref.phone.trim(),
      role: ref.role ? ref.role.trim() : undefined
    }));
    bgVerification.status = 'SUBMITTED';
    bgVerification.submittedAt = new Date();

    await bgVerification.save();

    // Enrich referee contacts with platform user ids (if the submitted email belongs to a verifier)
    // AND: always create a chat room for each shared contact. If the contact is not on-platform,
    // create a placeholder user account (marked externalContact) so we have a stable userId to represent them
    try {
      const crypto = require('crypto');
      const { sendBGNotificationToSharedContact, sendMagicLinkToExternal } = require('../utils/email');
      const MagicLinkToken = require('../models/MagicLinkToken');

      const updatedRefs = await Promise.all(bgVerification.refereeContacts.map(async (ref) => {
        // look up existing platform verifier
        let sharedUser = await User.findOne({ email: ref.email, role: 'VERIFIER' }).select('_id email name externalContact');

        let createdPlaceholder = false;
        let isExternalUser = false;

        if (!sharedUser) {
          // create a placeholder user so we can attach an id and open a chat
          // External users will use magic links for login, so we set a dummy password hash
          const crypto = require('crypto');
          const dummyPassword = crypto.randomBytes(16).toString('hex');
          
          const placeholder = new User({
            name: ref.name || ref.email,
            email: ref.email,
            role: 'VERIFIER',
            passwordHash: dummyPassword, // dummy hash for magic link users (won't be used)
            externalContact: true,
            profileSetupComplete: false,
            emailVerified: false
          });

          try {
            await placeholder.save();
            sharedUser = placeholder;
            createdPlaceholder = true;
            isExternalUser = true;
          } catch (createErr) {
            console.error('Failed to create placeholder user for referee:', createErr);
            // If creation fails for some reason, continue without userId but still return ref
            return ref;
          }
        }

        // attach userId to the stored referee contact for frontend convenience
        ref.userId = sharedUser._id;

        // Ensure chat exists between requesting verifier and this shared contact (always create)
        const chat = await BackgroundVerificationChat.findOrCreateChat(
          bgVerification._id,
          bgVerification.verifierId,
          bgVerification.verifierEmail,
          sharedUser._id,
          sharedUser.email,
          bgVerification.studentId,
          bgVerification.studentEmail
        );

        // Emit chat created event to both participants if io is available
        try {
          const io = req.app && req.app.locals && req.app.locals.io;
            if (io) {
              console.log(`Emit bg_chat_created on submit -> user:${bgVerification.verifierId}, user:${sharedUser._id} (chat ${chat._id})`);
              io.to(`user:${bgVerification.verifierId}`).emit('bg_chat_created', { chatId: chat._id, requestId: bgVerification._id });
              io.to(`user:${sharedUser._id}`).emit('bg_chat_created', { chatId: chat._id, requestId: bgVerification._id });
            }
        } catch (emitErr) {
          console.warn('Socket emit (chat created on submit) failed:', emitErr && emitErr.message ? emitErr.message : emitErr);
        }

        // Build frontend chat link (frontend should have a route to open by chat id)
        const chatLink = `${process.env.FRONTEND_URL}/bg-chat/${chat._id}`;

        // Notify the shared user based on whether they're a platform user or external
        try {
          if (createdPlaceholder && isExternalUser) {
            // External user: send magic link email with chat access
            const magicLink = await MagicLinkToken.generateToken(
              sharedUser.email,
              'BG_VERIFICATION',
              {
                bgVerificationId: bgVerification._id,
                chatId: chat._id,
                userId: sharedUser._id
              }
            );

            const magicLinkUrl = `${process.env.FRONTEND_URL}/auth/magic-link/${magicLink.token}?redirect=/bg-chat/${chat._id}`;

            try {
              await sendMagicLinkToExternal(
                sharedUser.email,
                sharedUser.name || ref.name || sharedUser.email,
                magicLinkUrl,
                bgVerification.verifierName,
                bgVerification.studentName
              );
            } catch (emailErr) {
              console.warn('Failed to send magic link to external user:', emailErr);
            }
          } else {
            // Existing platform user: send notification with direct chat link
            try {
              await sendBGNotificationToSharedContact(
                sharedUser.email,
                sharedUser.name || ref.name,
                bgVerification.verifierName,
                bgVerification.studentName,
                chatLink
              );
            } catch (emailErr) {
              console.warn('Failed to send BG notification to platform user:', emailErr);
            }
          }
        } catch (notifErr) {
          console.warn('Failed to send notification email for shared user:', notifErr);
        }

        return ref;
      }));

      // persist any userId additions
      bgVerification.refereeContacts = updatedRefs;
      await bgVerification.save();
    } catch (err) {
      console.error('Error enriching referee contacts or creating chats:', err);
    }

    res.json({
      message: 'Referee contacts submitted successfully',
      request: {
        id: bgVerification._id,
        status: bgVerification.status,
        refereeContactsSubmitted: bgVerification.refereeContacts.length,
        submittedAt: bgVerification.submittedAt,
        refereeContacts: bgVerification.refereeContacts
      }
    });

  } catch (error) {
    console.error('Submit referee contacts error:', error);
    res.status(500).json({
      message: 'Failed to submit referee contacts',
      error: error.message
    });
  }
});

// 5) Verifier: View pending background verification requests with referee contacts
router.get('/requests', requireAuth, requireVerifier, async (req, res) => {
  try {
    const { status = 'SUBMITTED', page = 1, limit = 10 } = req.query;
    const verifier = req.user;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {
      verifierId: verifier._id
    };

    if (status && status !== 'ALL') {
      query.status = status.toUpperCase();
    }

    if (status === 'PENDING' || status === 'SUBMITTED' || status === 'IN_REVIEW') {
      query.expiresAt = { $gt: new Date() };
    }

    const [requests, total] = await Promise.all([
      BackgroundVerification.find(query)
        .populate('studentId', 'name email institute profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      BackgroundVerification.countDocuments(query)
    ]);

    // For each request, include any matching platform user id for referee contacts
    const formattedRequests = await Promise.all(requests.map(async req => {
      const refereeContacts = await Promise.all(req.refereeContacts.map(async (ref) => {
        // try to find a corresponding platform user by email
        const matchedUser = await User.findOne({ email: ref.email }).select('_id role externalContact');
        return {
          name: ref.name,
          email: ref.email,
          phone: ref.phone,
          role: ref.role,
          submittedAt: ref.submittedAt,
          userId: matchedUser ? matchedUser._id : null,
          userRole: matchedUser ? matchedUser.role : null,
          externalContact: matchedUser ? !!matchedUser.externalContact : null
        };
      }));

      return {
        id: req._id,
        student: {
          id: req.studentId._id,
          name: req.studentName,
          email: req.studentEmail,
          institute: req.studentInstitute,
          profilePicture: req.studentId.profilePicture
        },
        refereeContactsRequested: req.refereeContactsRequested,
        refereeContacts,
        status: req.status,
        requestedAt: req.requestedAt,
        submittedAt: req.submittedAt,
        reviewedAt: req.reviewedAt,
        notes: req.notes,
        expiresAt: req.expiresAt
      };
    }));

    res.json({
      requests: formattedRequests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get background verification requests error:', error);
    res.status(500).json({
      message: 'Failed to fetch background verification requests',
      error: error.message
    });
  }
});

// --- Chat endpoints ---

// List all chat rooms for the authenticated verifier (both requester & shared contact)
router.get('/chats', requireAuth, requireVerifier, async (req, res) => {
  try {
    const userId = req.user._id;
    const chats = await BackgroundVerificationChat.findByParticipant(userId);

    const formatted = chats.map(chat => {
      // Determine other participant and title depending on who is viewing
      const isRequester = chat.requestingVerifierId._id.toString() === userId.toString();
      const other = isRequester ? chat.sharedContactId : chat.requestingVerifierId;

      const lastMsg = chat.messages && chat.messages.length ? chat.messages[chat.messages.length - 1] : null;

      return {
        id: chat._id,
        bgVerificationId: chat.bgVerificationId ? chat.bgVerificationId._id : null,
        title: other.name || other.email,
        participant: {
          id: other._id,
          name: other.name,
          email: other.email,
          institute: other.institute
        },
        lastMessage: lastMsg ? { text: lastMsg.message, senderName: lastMsg.senderName, createdAt: lastMsg.createdAt } : null,
        lastMessageAt: chat.lastMessageAt || chat.createdAt,
        isActive: chat.isActive
      };
    });

    res.json({ chats: formatted });
  } catch (error) {
    console.error('List chats error:', error);
    res.status(500).json({ message: 'Failed to list chats', error: error.message });
  }
});

// Get a single chat and its messages (participant only)
router.get('/chat/:chatId', requireAuth, requireVerifier, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await BackgroundVerificationChat.findById(chatId)
      .populate('requestingVerifierId', 'name email institute')
      .populate('sharedContactId', 'name email institute')
      .populate('bgVerificationId', 'studentName studentInstitute');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const isParticipant = [chat.requestingVerifierId._id.toString(), chat.sharedContactId._id.toString()].includes(userId.toString());
    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied. Not a participant of this chat.' });
    }

    res.json({
      id: chat._id,
      bgVerificationId: chat.bgVerificationId ? chat.bgVerificationId._id : null,
      participants: {
        requestingVerifier: chat.requestingVerifierId,
        sharedContact: chat.sharedContactId
      },
      messages: chat.messages,
      lastMessageAt: chat.lastMessageAt
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ message: 'Failed to fetch chat', error: error.message });
  }
});

// Send a message in a chat (participant only)
router.post('/chat/:chatId/message', requireAuth, requireVerifier, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const user = req.user;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Message must be a non-empty string' });
    }

    const chat = await BackgroundVerificationChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const isParticipant = [chat.requestingVerifierId.toString(), chat.sharedContactId.toString()].includes(user._id.toString());
    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied. Not a participant of this chat.' });
    }

    const savedChat = await chat.addMessage(user._id, user.email, user.name, user.role, message.trim());

    // Emit real-time event to the chat room if Socket.IO is configured
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        const lastMsg = savedChat.messages && savedChat.messages.length ? savedChat.messages[savedChat.messages.length - 1] : null;
        console.log(`Emit bg_message to bg-chat:${chatId} — sender: ${lastMsg ? lastMsg.senderEmail : 'n/a'} id: ${lastMsg ? lastMsg._id : 'n/a'}`);
        io.to(`bg-chat:${chatId}`).emit('bg_message', {
          chatId: chatId,
          bgVerificationId: savedChat.bgVerificationId,
          message: lastMsg
        });
      }
    } catch (emitErr) {
      console.warn('Socket emit failed:', emitErr && emitErr.message ? emitErr.message : emitErr);
    }

    res.json({ message: 'Message sent' });
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
});

// ----- Shared-contact (referee) endpoints -----

// List all background verification requests where the authenticated verifier
// has been shared as a referee (i.e. "shared with me").
router.get('/shared-requests', requireAuth, requireVerifier, async (req, res) => {
  try {
    const user = req.user;
    const userEmail = (user.email || '').toLowerCase().trim();

    // Find background verification requests where one of the refereeContacts has this email
    const requests = await BackgroundVerification.find({
      'refereeContacts.email': userEmail,
      expiresAt: { $gt: new Date() }
    })
      .populate('verifierId', 'name email institute')
      .populate('studentId', 'name email institute');

    const formatted = await Promise.all(requests.map(async bg => {
  const matchingRef = bg.refereeContacts.find(r => r.email === userEmail) || {};
  const chat = await BackgroundVerificationChat.findOne({ bgVerificationId: bg._id, sharedContactId: user._id }).select('_id');

      return {
        id: bg._id,
        verifier: {
          id: bg.verifierId ? bg.verifierId._id : bg.verifierId,
          name: bg.verifierName,
          email: bg.verifierEmail,
          institute: bg.verifierInstitute
        },
        student: {
          id: bg.studentId ? bg.studentId._id : bg.studentId,
          name: bg.studentName,
          email: bg.studentEmail,
          institute: bg.studentInstitute
        },
        referee: {
          name: matchingRef.name,
          email: matchingRef.email,
          phone: matchingRef.phone,
          role: matchingRef.role,
          submittedAt: matchingRef.submittedAt
        },
        status: bg.status,
        submittedAt: bg.submittedAt,
        chatId: chat ? chat._id : null
      };
    }));

    res.json({ requests: formatted });
  } catch (error) {
    console.error('Get shared requests error:', error);
    res.status(500).json({ message: 'Failed to fetch shared requests', error: error.message });
  }
});

// Referee: Start or get a chat for a specific background verification request
router.post('/shared-requests/:requestId/start-chat', requireAuth, requireVerifier, async (req, res) => {
  try {
    const { requestId } = req.params;
    const user = req.user;
    const userEmail = (user.email || '').toLowerCase().trim();

    const bg = await BackgroundVerification.findById(requestId);
    if (!bg) return res.status(404).json({ message: 'Background verification request not found' });

    // Ensure this user was actually shared as a referee in this request
    const matched = bg.refereeContacts.find(r => r.email === userEmail);
    if (!matched) {
      return res.status(403).json({ message: 'This request was not shared with you' });
    }

    // Find or create chat
    // bg.verifierId is the requesting verifier
    const chat = await BackgroundVerificationChat.findOrCreateChat(
      bg._id,
      bg.verifierId,
      bg.verifierEmail,
      user._id,
      user.email,
      bg.studentId,
      bg.studentEmail
    );

    // Emit an event to notify the requesting verifier that a chat exists/was opened
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        const roomForUser = `user:${bg.verifierId}`;
        console.log(`Emit bg_chat_created (referee start) -> ${roomForUser}, user:${user._id} (chat ${chat._id})`);
        io.to(roomForUser).emit('bg_chat_created', { chatId: chat._id, requestId: bg._id });
        // notify the referee's user room as well
        io.to(`user:${user._id}`).emit('bg_chat_created', { chatId: chat._id, requestId: bg._id });
      }
    } catch (emitErr) {
      console.warn('Socket emit (chat created referee) failed:', emitErr && emitErr.message ? emitErr.message : emitErr);
    }

    res.json({ message: 'Chat ready', chatId: chat._id });
  } catch (error) {
    console.error('Start chat (referee) error:', error);
    res.status(500).json({ message: 'Failed to start chat', error: error.message });
  }
});

// Requester: start or get a chat in a request with a specific shared contact (by id)
router.post('/requests/:requestId/start-chat', requireAuth, requireVerifier, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { sharedContactId } = req.body; // ObjectId of the shared contact (platform user)
    const user = req.user;

    const bg = await BackgroundVerification.findById(requestId);
    if (!bg) return res.status(404).json({ message: 'Background verification request not found' });

    // Only the requesting verifier can start a chat this way
    if (bg.verifierId.toString() !== user._id.toString()) {
      return res.status(403).json({ message: 'Only the requesting verifier can start chats from this endpoint' });
    }

    // Ensure the sharedContactId was part of submitted refereeContacts (match by email or id)
    const sharedUser = await User.findById(sharedContactId).select('_id email name role');
    if (!sharedUser) return res.status(404).json({ message: 'Shared contact user not found' });

    const sharedEmail = (sharedUser.email || '').toLowerCase().trim();
    const matched = bg.refereeContacts.find(r => r.email === sharedEmail);
    if (!matched) {
      return res.status(400).json({ message: 'Provided user was not shared as a referee in this request' });
    }

    const chat = await BackgroundVerificationChat.findOrCreateChat(
      bg._id,
      bg.verifierId,
      bg.verifierEmail,
      sharedUser._id,
      sharedUser.email,
      bg.studentId,
      bg.studentEmail
    );

    // Notify both participants (requester & shared user) about the chat creation
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        console.log(`Emit bg_chat_created (requester start) -> user:${bg.verifierId}, user:${sharedUser._id} (chat ${chat._id})`);
        io.to(`user:${bg.verifierId}`).emit('bg_chat_created', { chatId: chat._id, requestId: bg._id });
        io.to(`user:${sharedUser._id}`).emit('bg_chat_created', { chatId: chat._id, requestId: bg._id });
      }
    } catch (emitErr) {
      console.warn('Socket emit (chat created requester) failed:', emitErr && emitErr.message ? emitErr.message : emitErr);
    }

    res.json({ message: 'Chat ready', chatId: chat._id });
  } catch (error) {
    console.error('Start chat (requester) error:', error);
    res.status(500).json({ message: 'Failed to start chat', error: error.message });
  }
});

// NOTE: The review endpoint (approve/reject/request_info) has been replaced by a simple
// 'complete' action. Verifiers mark a submitted request as completed; there is no
// separate review workflow in this implementation.

module.exports = router;
