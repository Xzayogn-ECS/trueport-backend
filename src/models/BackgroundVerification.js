const mongoose = require('mongoose');

const backgroundVerificationSchema = new mongoose.Schema({
  // Student being verified
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentName: {
    type: String,
    required: true
  },
  studentEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  studentInstitute: {
    type: String,
    required: true,
    trim: true
  },

  // Verifier requesting the background check
  verifierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verifierName: {
    type: String,
    required: true
  },
  verifierEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  verifierInstitute: {
    type: String,
    required: true,
    trim: true
  },

  // Referee contact information requested and submitted by student
  refereeContactsRequested: {
    type: Number,
    default: 3,
    min: 1,
    max: 3
  },
  refereeContacts: [{
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    role: {
      type: String,
      trim: true,
      maxLength: 100 // e.g., "Project Lead", "Manager", "Teacher"
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Status tracking
  status: {
    type: String,
    enum: ['PENDING', 'SUBMITTED'],
    default: 'PENDING'
  },

  // Completion flag (only verifier who requested can set to true)
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Timestamps
  requestedAt: {
    type: Date,
    default: Date.now
  },
  submittedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
backgroundVerificationSchema.index({ studentId: 1, status: 1 });
backgroundVerificationSchema.index({ verifierId: 1, status: 1 });
backgroundVerificationSchema.index({ verifierInstitute: 1, status: 1 });
backgroundVerificationSchema.index({ studentInstitute: 1, status: 1 });
backgroundVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Unique constraint: only one active/pending background verification per student per verifier
backgroundVerificationSchema.index(
  { studentId: 1, verifierId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['PENDING', 'SUBMITTED'] } }
  }
);

// Methods
backgroundVerificationSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

backgroundVerificationSchema.methods.hasAllReferences = function() {
  return this.refereeContacts.length >= this.refereeContactsRequested;
};

// Static methods
backgroundVerificationSchema.statics.findPendingForVerifier = function(verifierId) {
  return this.find({
    verifierId,
    status: { $in: ['PENDING', 'SUBMITTED'] },
    expiresAt: { $gt: new Date() }
  }).populate('studentId', 'name email institute profilePicture');
};

backgroundVerificationSchema.statics.findPendingForStudent = function(studentId) {
  return this.find({
    studentId,
    status: { $in: ['PENDING', 'SUBMITTED'] },
    expiresAt: { $gt: new Date() }
  }).populate('verifierId', 'name email institute');
};

module.exports = mongoose.model('BackgroundVerification', backgroundVerificationSchema);
