const mongoose = require('mongoose');

const backgroundVerificationChatSchema = new mongoose.Schema({
  // Reference to the background verification request
  bgVerificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BackgroundVerification',
    required: true
  },

  // Participants in the chat
  requestingVerifierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestingVerifierEmail: {
    type: String,
    required: true,
    lowercase: true
  },

  // The shared referee/contact (must be a verifier on the platform)
  sharedContactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sharedContactEmail: {
    type: String,
    required: true,
    lowercase: true
  },

  // The student who shared the contact
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentEmail: {
    type: String,
    required: true,
    lowercase: true
  },

  // Chat messages
  messages: [{
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderEmail: {
      type: String,
      required: true,
      lowercase: true
    },
    senderName: {
      type: String,
      required: true
    },
    senderRole: {
      type: String,
      enum: ['STUDENT', 'VERIFIER'],
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxLength: 2000
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Status tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastMessageAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
backgroundVerificationChatSchema.index({ bgVerificationId: 1 });
backgroundVerificationChatSchema.index({ requestingVerifierId: 1, isActive: 1 });
backgroundVerificationChatSchema.index({ sharedContactId: 1, isActive: 1 });
backgroundVerificationChatSchema.index({ studentId: 1 });
backgroundVerificationChatSchema.index({ createdAt: -1 });

// Methods
backgroundVerificationChatSchema.methods.addMessage = function(senderId, senderEmail, senderName, senderRole, message) {
  this.messages.push({
    senderId,
    senderEmail,
    senderName,
    senderRole,
    message
  });
  this.lastMessageAt = new Date();
  return this.save();
};

backgroundVerificationChatSchema.methods.getParticipants = function() {
  return {
    requestingVerifier: {
      id: this.requestingVerifierId,
      email: this.requestingVerifierEmail
    },
    sharedContact: {
      id: this.sharedContactId,
      email: this.sharedContactEmail
    },
    student: {
      id: this.studentId,
      email: this.studentEmail
    }
  };
};

// Static methods
backgroundVerificationChatSchema.statics.findByParticipant = function(userId) {
  return this.find({
    $or: [
      { requestingVerifierId: userId },
      { sharedContactId: userId }
    ],
    isActive: true
  })
    .populate('requestingVerifierId', 'name email institute')
    .populate('sharedContactId', 'name email institute')
    .populate('bgVerificationId', 'studentName studentInstitute status')
    .sort({ lastMessageAt: -1 });
};

backgroundVerificationChatSchema.statics.findOrCreateChat = function(bgVerificationId, requestingVerifierId, requestingVerifierEmail, sharedContactId, sharedContactEmail, studentId, studentEmail) {
  return this.findOne({
    bgVerificationId,
    requestingVerifierId,
    sharedContactId
  }).then(chat => {
    if (chat) return chat;

    const newChat = new this({
      bgVerificationId,
      requestingVerifierId,
      requestingVerifierEmail,
      sharedContactId,
      sharedContactEmail,
      studentId,
      studentEmail
    });

    return newChat.save();
  });
};

module.exports = mongoose.model('BackgroundVerificationChat', backgroundVerificationChatSchema);
