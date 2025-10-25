const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxLength: 200
  },
  description: {
    type: String,
    required: true,
    maxLength: 2000
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'COMPETITION',
      'HACKATHON',
      'WORKSHOP',
      'SEMINAR',
      'CONFERENCE',
      'AWARD',
      'SPORTS',
      'CULTURAL',
      'ACADEMIC',
      'RESEARCH',
      'OTHER'
    ]
  },
  institution: {
    type: String,
    required: true,
    index: true
  },
  organizer: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true
    }
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value >= this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  location: {
    type: String,
    trim: true,
    maxLength: 200
  },
  tags: [{
    type: String,
    trim: true,
    maxLength: 50
  }],
  attachments: [{
    type: String, // Cloudinary URLs for event certificates, banners, etc.
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Attachment must be a valid URL'
    }
  }],
  // Awards/recognitions given in the event
  awards: [{
    position: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100 // e.g., "1st Place", "Winner", "Best Project", "Participant"
    },
    title: {
      type: String,
      trim: true,
      maxLength: 200
    },
    description: {
      type: String,
      trim: true,
      maxLength: 500
    }
  }],
  // Participants/awardees
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100 // e.g., "Participant", "Organizer", "Winner", "Team Member"
    },
    position: {
      type: String,
      trim: true,
      maxLength: 100 // Award position if applicable
    },
    teamName: {
      type: String,
      trim: true,
      maxLength: 100
    },
    certificate: {
      type: String, // Certificate URL if different per participant
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Certificate must be a valid URL'
      }
    },
    // Track if experience was created for this participant
    experienceCreated: {
      type: Boolean,
      default: false
    },
    experienceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Experience'
    },
    // Award/Position assigned by judges or coordinators
    award: {
      rank: {
        type: Number,
        min: 1
      },
      label: {
        type: String,
        trim: true,
        maxLength: 100 // e.g., "Best Speaker", "Best Project", "Best Teamwork"
      },
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      assignedAt: {
        type: Date
      }
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Assigned users for event operations
  coordinators: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      // optional: assigned coordinators may be added later
    },
    assignedAt: {
      type: Date,
      default: Date.now
    }
  }],
  inCharges: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      // optional: assigned in-charges may be added later
    },
    assignedAt: {
      type: Date,
      default: Date.now
    }
  }],
  judges: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      // optional: assigned judges may be added later
    },
    assignedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Who created the event
  createdBy: {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    adminType: {
      type: String,
      enum: ['INSTITUTE_ADMIN', 'VERIFIER'],
      required: true
    },
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT'
  },
  isPublic: {
    type: Boolean,
    default: true // Whether the event is visible to students
  },
  // Track experiences pushed to students
  experiencesPushedCount: {
    type: Number,
    default: 0
  },
  experiencesPushedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
eventSchema.index({ institution: 1, createdAt: -1 });
eventSchema.index({ status: 1 });
eventSchema.index({ eventType: 1 });
eventSchema.index({ startDate: -1 });
eventSchema.index({ 'participants.userId': 1 });

// Method to add participant to event
eventSchema.methods.addParticipant = function(participantData) {
  // Check if user already exists in participants
  const existingIndex = this.participants.findIndex(
    p => p.userId.toString() === participantData.userId.toString()
  );
  
  if (existingIndex >= 0) {
    // Update existing participant
    this.participants[existingIndex] = {
      ...this.participants[existingIndex].toObject(),
      ...participantData
    };
  } else {
    // Add new participant
    this.participants.push(participantData);
  }
};

// Method to remove participant from event
eventSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(
    p => p.userId.toString() !== userId.toString()
  );
};

// Method to check if user is a participant
eventSchema.methods.isParticipant = function(userId) {
  return this.participants.some(
    p => p.userId.toString() === userId.toString()
  );
};

// Method to check if user is a coordinator
eventSchema.methods.isCoordinator = function(userId) {
  return this.coordinators.some(c => c.userId.toString() === userId.toString());
};

// Method to check if user is an in-charge
eventSchema.methods.isInCharge = function(userId) {
  return this.inCharges.some(c => c.userId.toString() === userId.toString());
};

// Method to check if user is a judge
eventSchema.methods.isJudge = function(userId) {
  return this.judges.some(j => j.userId.toString() === userId.toString());
};

module.exports = mongoose.model('Event', eventSchema);
