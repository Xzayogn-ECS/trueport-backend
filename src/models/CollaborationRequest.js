const mongoose = require('mongoose');

const collaborationRequestSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  projectOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  requestedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  role: {
    type: String,
    trim: true,
    maxLength: 100,
    // e.g., "Frontend Developer", "UI/UX Designer", "Backend Developer"
  },
  message: {
    type: String,
    trim: true,
    maxLength: 500
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  respondedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxLength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
collaborationRequestSchema.index({ projectId: 1, requestedUserId: 1, status: 1 });
collaborationRequestSchema.index({ requestedUserId: 1, status: 1, createdAt: -1 });
collaborationRequestSchema.index({ projectOwnerId: 1, status: 1 });

// Prevent duplicate pending requests
collaborationRequestSchema.index(
  { projectId: 1, requestedUserId: 1 },
  { 
    unique: true,
    partialFilterExpression: { status: 'PENDING' }
  }
);

module.exports = mongoose.model('CollaborationRequest', collaborationRequestSchema);
