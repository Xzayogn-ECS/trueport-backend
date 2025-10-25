const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxLength: 100
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  passwordHash: {
    type: String,
    required: function() {
      return !this.githubUsername && !this.googleId; // Password required only if no GitHub/Google login
    }
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  isGoogleAuth: {
    type: Boolean,
    default: false
  },
  profilePicture: {
    type: String,
    trim: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  profileSetupComplete: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['STUDENT', 'VERIFIER'],
    default: 'STUDENT'
  },
  roleSetPermanently: {
    type: Boolean,
    default: false
  },
  roleSetAt: {
    type: Date
  },
  associationStatus: {
    type: String,
    enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'],
    default: 'NONE'
  },
  associationType: {
    type: String,
    enum: ['ACTIVE', 'ALUMNI'],
    default: 'ACTIVE'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  githubUsername: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  githubToken: {
    type: String
  },
  bio: {
    type: String,
    trim: true,
    maxLength: 500
  },
  contactInfo: {
    phone: {
      type: String,
      trim: true,
      match: [/^[+]?[\d\s\-()]+$/, 'Please enter a valid phone number']
    },
    linkedinUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Allow empty
          return /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-]+\/?$/.test(v);
        },
        message: 'Please enter a valid LinkedIn profile URL'
      }
    }
  },
  customUrls: [{
    label: {
      type: String,
      required: true,
      trim: true,
      maxLength: 50 // e.g., "Behance", "Medium", "LeetCode", "Personal Website"
    },
    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Please enter a valid URL (must start with http:// or https://)'
      }
    },
    isVisible: {
      type: Boolean,
      default: true
    },
    order: {
      type: Number,
      default: 0 // For custom ordering
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  contactVisibility: {
    email: {
      type: Boolean,
      default: true
    },
    phone: {
      type: Boolean,
      default: false // Phone private by default
    },
    linkedinUrl: {
      type: Boolean,
      default: true
    },
    githubUsername: {
      type: Boolean,
      default: true
    },
    customUrls: {
      type: Boolean,
      default: true // Show custom URLs by default
    }
  },
  institute: {
    type: String,
    trim: true,
    maxLength: 200,
    index: true
  },
  // Optional student fields for easier participant search and school-level data
  dob: {
    type: Date
  },
  classLevel: {
    type: String,
    trim: true,
    maxLength: 20 // e.g., '10', '11', 'Nursery', 'KG', etc.
  },
  section: {
    type: String,
    trim: true,
    maxLength: 10
  },
  house: {
    type: String,
    trim: true,
    maxLength: 50
  },
  profileJson: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  portfolioSettings: {
    visibility: {
      type: String,
      enum: ['PUBLIC', 'PRIVATE', 'INSTITUTE_ONLY'],
      default: 'PUBLIC'
    },
    sections: {
      showExperiences: { type: Boolean, default: true },
      showEducation: { type: Boolean, default: true },
      showProjects: { type: Boolean, default: true },
      showGithubRepos: { type: Boolean, default: true },
      showBio: { type: Boolean, default: true },
      showInstitute: { type: Boolean, default: true }
    }
  },
  
  // Institutions created by this user
  createdInstitutions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution'
  }],

  // Approved alumni associations (display-only records)
  alumniAssociations: [{
    institute: { type: String, trim: true, maxLength: 200 },
    role: { type: String, enum: ['STUDENT', 'VERIFIER'] },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date }
  }],
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster lookups
userSchema.index({ email: 1 });
userSchema.index({ githubUsername: 1 });
userSchema.index({ googleId: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const saltRounds = 12;
    this.passwordHash = await bcrypt.hash(this.passwordHash, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// JSON response transformation
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.passwordHash;
  delete user.githubToken;
  return user;
};

module.exports = mongoose.model('User', userSchema);