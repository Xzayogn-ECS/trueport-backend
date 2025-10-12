const mongoose = require('mongoose');

const institutionClaimRequestSchema = new mongoose.Schema({
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxLength: 100
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  designation: {
    type: String,
    required: true,
    trim: true,
    maxLength: 100
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  },
  reviewedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    maxLength: 500
  }
}, {
  timestamps: true
});

// Indexes
institutionClaimRequestSchema.index({ institutionId: 1, status: 1 });
institutionClaimRequestSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('InstitutionClaimRequest', institutionClaimRequestSchema);
