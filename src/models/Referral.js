const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  brand: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true
  },
  code: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        // Either code or link must be present
        return v || this.link;
      },
      message: 'Either code or link must be provided'
    }
  },
  link: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        // Either code or link must be present
        return v || this.code;
      },
      message: 'Either code or link must be provided'
    }
  },
  tags: [{
    type: String,
    trim: true
  }],
  postDate: {
    type: Date,
    default: Date.now
  },
  expirationDate: {
    type: Date,
    required: [true, 'Expiration date is required']
  },
  isValid: {
    type: Boolean,
    default: true
  },
  lastValidated: {
    type: Date,
    default: Date.now
  }
});

// Updated index to include link for uniqueness
referralSchema.index({ brand: 1, code: 1, link: 1 }, { unique: true });
referralSchema.index({ tags: 1 });
referralSchema.index({ postDate: -1 });

// Pre-save middleware to validate code
referralSchema.pre('save', async function (next) {
  if (this.isModified('code') || this.isModified('link')) {
    this.isValid = await this.validateCode();
    this.lastValidated = new Date();
  }
  next();
});

// Method to validate code
referralSchema.methods.validateCode = async function () {
  // Implement your code validation logic here
  // This is a placeholder - you'll need to implement actual validation
  // based on your requirements (e.g., checking against brand's API)
  return true;
};

// Updated static method to check for duplicate codes or links
referralSchema.statics.checkDuplicate = async function (brand, code, link) {
  if (!brand) return false;

  const query = { brand };

  // If both code and link are provided, check for either match
  if (code && link) {
    query.$or = [
      { code },
      { link }
    ];
  } else if (code) {
    query.code = code;
  } else if (link) {
    query.link = link;
  } else {
    return false; // If neither code nor link is provided, cannot check for duplicate
  }

  const existing = await this.findOne(query);
  return !!existing;
};

const Referral = mongoose.model('Referral', referralSchema);

module.exports = Referral;