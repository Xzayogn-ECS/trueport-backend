const mongoose = require('mongoose');

const profileUpdateRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // changes contains keys like dob, classLevel, section, house
  changes: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
    index: true
  },
  decisionComment: {
    type: String,
    maxLength: 1000
  },
  decidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  decidedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

profileUpdateRequestSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('ProfileUpdateRequest', profileUpdateRequestSchema);
