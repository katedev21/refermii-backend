require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const Referral = require('./models/Referral');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

// Extract validation logic to a shared utility function
const validateReferralData = async (data) => {
  const errors = [];

  // Validate required fields
  if (!data.brand || data.brand.trim() === '') {
    errors.push({ msg: 'Brand name is required', param: 'brand' });
  }

  // Validate that either code or link is provided
  if ((!data.code || data.code.trim() === '') && (!data.link || data.link.trim() === '')) {
    errors.push({ msg: 'Either code or link must be provided', param: 'code' });
  }

  // Validate expiration date
  if (!data.expirationDate) {
    errors.push({ msg: 'Valid expiration date is required', param: 'expirationDate' });
  } else {
    try {
      // Check if it's a valid date
      const date = new Date(data.expirationDate);
      if (isNaN(date.getTime())) {
        errors.push({ msg: 'Invalid expiration date format', param: 'expirationDate' });
      }
    } catch (err) {
      errors.push({ msg: 'Invalid expiration date format', param: 'expirationDate' });
    }
  }

  // Check for duplicates if brand and code/link are provided
  if (data.brand && (data.code || data.link)) {
    const isDuplicate = await Referral.checkDuplicate(data.brand, data.code, data.link);
    if (isDuplicate) {
      errors.push({ msg: 'This referral already exists for this brand', param: 'code' });
    }
  }

  return errors;
};

// Validation middleware using express-validator
const validateReferral = [
  body('brand').trim().notEmpty().withMessage('Brand name is required'),
  body('code').custom(async (value, { req }) => {
    if (!value && !req.body.link) {
      throw new Error('Either code or link must be provided');
    }

    const isDuplicate = await Referral.checkDuplicate(
      req.body.brand,
      value,
      req.body.link
    );

    if (isDuplicate) {
      throw new Error('This referral already exists for this brand');
    }
    return true;
  }),
  body('expirationDate').isISO8601().withMessage('Valid expiration date is required')
];

// Routes
app.get('/api/referrals', async (req, res) => {
  try {
    const { search, brand } = req.query;
    const query = { isValid: true, expirationDate: { $gt: new Date() } };

    if (search) {
      query.$or = [
        { brand: new RegExp(search, 'i') },
        { tags: new RegExp(search, 'i') }
      ];
    }

    if (brand) {
      query.brand = new RegExp(brand, 'i');
    }

    const referrals = await Referral.find(query)
      .sort({ postDate: -1 })
      .lean();

    res.json(referrals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/referrals', validateReferral, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const referral = new Referral({
      ...req.body,
      tags: req.body.tags || []
    });

    await referral.save();
    res.status(201).json(referral);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get a single referral by ID
app.get('/api/referrals/:id', async (req, res) => {
  try {
    const referral = await Referral.findById(req.params.id);
    if (!referral) {
      return res.status(404).json({ message: 'Referral not found' });
    }
    res.json(referral);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a referral
app.put('/api/referrals/:id', validateReferral, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const referral = await Referral.findById(req.params.id);
    if (!referral) {
      return res.status(404).json({ message: 'Referral not found' });
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id') {
        referral[key] = req.body[key];
      }
    });

    await referral.save();
    res.json(referral);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a referral
app.delete('/api/referrals/:id', async (req, res) => {
  try {
    const referral = await Referral.findById(req.params.id);
    if (!referral) {
      return res.status(404).json({ message: 'Referral not found' });
    }

    await referral.remove();
    res.json({ message: 'Referral deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Validation job
const validateExpiredCodes = async () => {
  try {
    const expired = await Referral.find({
      expirationDate: { $lt: new Date() },
      isValid: true
    });

    for (const referral of expired) {
      referral.isValid = false;
      await referral.save();
    }
  } catch (error) {
    console.error('Error validating expired codes:', error);
  }
};

// Export the validation function for use in other modules
module.exports.validateReferralData = validateReferralData;

// Run validation job every hour
setInterval(validateExpiredCodes, 60 * 60 * 1000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});