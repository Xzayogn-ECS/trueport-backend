const mongoose = require('mongoose');
const crypto = require('crypto');

const magicLinkTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  // Type of magic link (e.g., 'BG_VERIFICATION', 'EMAIL_VERIFICATION', 'PASSWORD_RESET')
  type: {
    type: String,
    enum: ['BG_VERIFICATION', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'INVITE'],
    default: 'BG_VERIFICATION',
    index: true
  },
  // Additional context data to pass along with the token
  context: {
    bgVerificationId: mongoose.Schema.Types.ObjectId,
    chatId: mongoose.Schema.Types.ObjectId,
    requestId: mongoose.Schema.Types.ObjectId,
    metadata: mongoose.Schema.Types.Mixed
  },
  // Track if the token has been used
  used: {
    type: Boolean,
    default: false,
    index: true
  },
  usedAt: {
    type: Date
  },
  // Expiry time (default 7 days for magic links)
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    },
    index: { expireAfterSeconds: 0 } // MongoDB TTL index
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

/**
 * Generate a new magic link token
 * @static
 * @param {string} email - The email address for the magic link
 * @param {string} type - The type of magic link (BG_VERIFICATION, etc.)
 * @param {object} context - Optional context data to store with token
 * @returns {Promise<object>} Created token document
 */
magicLinkTokenSchema.statics.generateToken = async function(email, type = 'BG_VERIFICATION', context = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  
  const magicLink = new this({
    token,
    email: email.toLowerCase().trim(),
    type,
    context
  });
  
  await magicLink.save();
  return magicLink;
};

/**
 * Verify and use a magic link token
 * @static
 * @param {string} token - The token to verify
 * @returns {Promise<object>} Token document if valid and not expired/used, null otherwise
 */
magicLinkTokenSchema.statics.verifyAndUseToken = async function(token) {
  const magicLink = await this.findOne({
    token,
    used: false,
    expiresAt: { $gt: new Date() }
  });

  if (!magicLink) {
    return null; // Token not found, expired, or already used
  }

  // Mark as used
  magicLink.used = true;
  magicLink.usedAt = new Date();
  await magicLink.save();

  return magicLink;
};

/**
 * Clean up expired tokens (optional utility)
 * @static
 * @returns {Promise<number>} Number of deleted documents
 */
magicLinkTokenSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
  return result.deletedCount;
};

module.exports = mongoose.model('MagicLinkToken', magicLinkTokenSchema);
