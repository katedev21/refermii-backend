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

// Validation middleware
const validateReferral = [
  body('brand').trim().notEmpty().withMessage('Brand name is required'),
  body('code').custom(async (value, { req }) => {
    if (!value && !req.body.link) {
      throw new Error('Either code or link must be provided');
    }
    if (value) {
      const isDuplicate = await Referral.checkDuplicate(req.body.brand, value);
      if (isDuplicate) {
        throw new Error('This code already exists for this brand');
      }
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

// Run validation job every hour
setInterval(validateExpiredCodes, 60 * 60 * 1000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 