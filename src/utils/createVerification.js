const Verification = require('../models/Verification');
const VerificationLog = require('../models/VerificationLog');
const { generateVerificationToken } = require('./jwt');

/**
 * Atomically create a new PENDING verification for an item or return the existing active one.
 * Returns { verification, created } where created is true when a new doc was inserted.
 * This uses optimistic insert+fallback on duplicate-key to avoid races. The DB must have
 * a unique partial index on { itemId, itemType } where status == 'PENDING' (added in model).
 */
async function createOrGetPendingVerification({ itemId, itemType, verifierEmail, verifierName = '', verifierOrganization = '', actorEmail = null, metadata = {} }) {
  if (!itemId || !itemType) throw new Error('itemId and itemType are required');

  const now = new Date();
  const normEmail = verifierEmail ? verifierEmail.toLowerCase().trim() : '';
  // First, check for any existing active pending verification for this item.
  // This prevents creating duplicates if the DB index hasn't been applied yet or
  // when duplicates already exist from an earlier state.
  const existing = await Verification.findOne({ itemId, itemType, status: 'PENDING', expiresAt: { $gt: now } }).sort({ createdAt: -1 });
  if (existing) {
    return { verification: existing, created: false };
  }

  const verificationDoc = new Verification({
    itemId,
    itemType,
    verifierEmail: normEmail,
    verifierName: verifierName || '',
    verifierOrganization: verifierOrganization || '',
    token: generateVerificationToken()
  });

  try {
    const saved = await verificationDoc.save();

    // Optionally create a log for creation
    if (actorEmail) {
      try {
        await new VerificationLog({
          verificationId: saved._id,
          action: 'CREATED',
          actorEmail: actorEmail,
          metadata: metadata || {}
        }).save();
      } catch (e) {
        // logging failure shouldn't block main flow
        console.warn('Failed to create verification log:', e && e.message ? e.message : e);
      }
    }

    return { verification: saved, created: true };
  } catch (err) {
    // Duplicate key likely thrown by unique partial index; fetch existing active pending verification
    if (err && err.code === 11000) {
      const existingAfter = await Verification.findOne({ itemId, itemType, status: 'PENDING', expiresAt: { $gt: now } }).sort({ createdAt: -1 });
      if (existingAfter) return { verification: existingAfter, created: false };
    }
    // Other errors: rethrow
    throw err;
  }
}

module.exports = { createOrGetPendingVerification };
