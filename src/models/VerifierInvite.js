const mongoose = require('mongoose');

const verifierInviteSchema = new mongoose.Schema({
  verificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Verification',
    required: true,
    index: true
  },
  email: { type: String, required: true, trim: true },
  emailLower: { type: String, required: true, lowercase: true, trim: true, index: true },
  name: { type: String, trim: true },
  organization: { type: String, trim: true },
  message: { type: String, trim: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['PENDING','ACCEPTED','REVOKED','EXPIRED','REJECTED'], default: 'PENDING', index: true },
  statusReason: { type: String },
  tokenJti: { type: String },
  tokenExpiresAt: { type: Date },
  actionTokenJti: { type: String },
  actionTokenExpiresAt: { type: Date },
  lastSentAt: { type: Date },
  usedAt: { type: Date },
  usedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  bounceFlag: { type: Boolean, default: false },
  complaintFlag: { type: Boolean, default: false },
  notifyCount: { type: Number, default: 0 },
  audit: [{ action: String, by: mongoose.Schema.Types.ObjectId, at: Date, meta: mongoose.Schema.Types.Mixed }]
}, { timestamps: true });

module.exports = mongoose.model('VerifierInvite', verifierInviteSchema);
