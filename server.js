const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require("crypto");


const app = express();
const PORT = 3000;

// MongoDB Connection
mongoose.connect('mongodb+srv://shimwaolivier7:shimwa2006@aviatorapp.h2x5poa.mongodb.net/aviator', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 6 * 60 * 60 * 1000 // 6 hours
  }
}));

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// User Schema
const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, required: true, unique: true },
  password: String,
  isActivated: { type: Boolean, default: false },
  role: { type: String, default: 'user' },
  sessionStart: { type: Date },
  mobileNumber: { type: String, default: '' },
  paid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },
  resetCode: String,
  platform: { type: String, default: '' }
   // NEW FIELD
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    return res.redirect('/')
  }
}

// HTML Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/admin',  isAuthenticated,(req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/country', (req, res) => res.sendFile(path.join(__dirname, 'public', 'country.html')));
app.get('/check',  isAuthenticated,(req, res) => res.sendFile(path.join(__dirname, 'public', 'check.html')));
app.get('/pricing',  isAuthenticated,(req, res) => res.sendFile(path.join(__dirname, 'public', 'bettingRW', 'pricing.html')));
app.get('/payment', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'bettingRW', 'payment.html')));
app.get('/payment60',  isAuthenticated ,(req, res) => res.sendFile(path.join(__dirname, 'public', 'bettingRW', 'payment60.html')));
app.get('/payment100', isAuthenticated,  (req, res) => res.sendFile(path.join(__dirname, 'public', 'bettingRW', 'payment100.html')));
app.get('/demo',  isAuthenticated ,(req, res) => res.sendFile(path.join(__dirname, 'public', 'bettingRW', 'paid.html')));

// Signup
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    await User.create({
      username,
      email: email.toLowerCase(),
      password,
      isActivated: false,
      role: 'user',
      sessionStart: new Date(),
      mobileNumber: '',
      paid: false,
      paidAt: null
    });

    res.status(201).json({ message: 'Signup successful' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

app.post('/api/login', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password?.trim();

  if (!email || !password) return res.status(400).json({ error: 'All fields are required' });

  // Admin shortcut
  if (email === 'admin@123.com' && password === 'admin.123') {
    req.session.user = { email, username: 'Admin', role: 'admin', isActivated: true };
    return res.json({ redirect: '/admin' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      isActivated: user.isActivated
    };

    // Decide redirect path
    if (user.isActivated) {
      return res.json({ redirect: '/check' });
    } else if (user.platform && user.paid) {
      return res.json({ redirect: '/payment' });
    } else {
      return res.json({ redirect: '/country' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});



// Save Payment Selection
app.post('/api/save-payment', async (req, res) => {
  const { platform, price } = req.body;
  const sessionUser = req.session.user;

  if (!sessionUser) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const user = await User.findOne({ email: sessionUser.email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.platform = platform;
    user.paid = true;
    user.paidAt = new Date();

    await user.save();

    res.json({ message: `Platform '${platform}' and price ${price} RWF saved successfully.` });
  } catch (error) {
    console.error('Save payment error:', error);
    res.status(500).json({ error: 'Failed to save payment selection.' });
  }
});

// Session check
app.post('/api/session-check', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    let user = await User.findOne({ email: email.toLowerCase() });
    const now = new Date();
    const today = now.toDateString();

    if (!user) {
      user = await User.create({ email: email.toLowerCase(), sessionStart: now });
      return res.json({ remaining: 6 * 60 * 60 * 1000 });
    }

    const sessionStart = new Date(user.sessionStart || now);
    if (sessionStart.toDateString() !== today) {
      user.sessionStart = now;
      await user.save();
      return res.json({ remaining: 6 * 60 * 60 * 1000 });
    }

    const elapsed = now - sessionStart;
    const remaining = 6 * 60 * 60 * 1000 - elapsed;

    if (remaining <= 0) {
      return res.status(403).json({ error: 'Session expired' });
    }

    return res.json({ remaining });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({ error: 'Internal server error during session check' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// Prediction
function getCrashMultiplier(hash) {
  const H = BigInt('0x' + hash);
  if (H % 33n === 0n) return 1.00; // 1 in 33 chance of instant crash
  return Number((100n * 2n ** 52n) / (2n ** 52n - H % (2n ** 52n))) / 100;
}

app.get('/api/predict', isAuthenticated , (req, res) => {
  // Step 1: Generate secure seed
  const seed = crypto.randomBytes(32).toString('hex');

  // Step 2: Hash the seed
  const hash = crypto.createHash('sha256').update(seed).digest('hex');

  // Step 3: Calculate secure multiplier
  const multiplier = getCrashMultiplier(hash).toFixed(2);

  // Return result
  res.json({
    prediction: `${multiplier}X`,
    seed,
    hash
  });
});
// Get all users (admin view)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username email isActivated role mobileNumber  mobileNumber platform paid createdAt');
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).send('User not found');
    res.send('User deleted');
  } catch (err) {
    res.status(500).send('Failed to delete user');
  }
});

// Toggle activation
app.patch('/api/users/:id/toggle', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot modify admin user' });

    user.isActivated = !user.isActivated;
    await user.save();
    res.json({ message: 'User activation status updated', user });
  } catch (error) {
    console.error('Toggle user activation error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// New: Activate user and send email
app.post('/api/users/:id/activate',  isAuthenticated ,async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isActivated) return res.status(400).json({ error: 'User already activated' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot activate admin user' });

    // Activate user
    user.isActivated = true;
    await user.save();

    // Send activation email via EmailJS REST API
    const serviceId = 'service_vv5o0ng';
    const templateId = 'template_w61fy24';
    const userId = 'abfC9oICRtMIGM5cb';

    const emailParams = {
      user_id: userId,
      service_id: serviceId,
      template_id: templateId,
      template_params: {
        username: user.username,
        user_email: user.email,
        // You can add more variables here if your template requires
      }
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailParams)
    });

    if (!response.ok) {
      console.error('Failed to send activation email:', await response.text());
      return res.status(500).json({ error: 'Failed to send activation email' });
    }

    res.json({ message: 'User activated and email sent', user });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ error: 'Internal server error during activation' });
  }
});

// Monthly report
app.get('/api/users/report/monthly', async (req, res) => {
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const usersThisMonth = await User.find({
      createdAt: { $gte: firstDay },
    });

    const count = usersThisMonth.length;
    const income = count * 30000;
    const goal = 500000;
    const progress = ((income / goal) * 100).toFixed(2);

    res.json({
      month: now.toLocaleString('default', { month: 'long' }),
      userCount: count,
      income,
      goal,
      progress,
    });
  } catch (err) {
    res.status(500).send('Failed to generate report');
  }
});

// Get user's mobile number
app.get('/api/mobile',  isAuthenticated ,async (req, res) => {
  if (!req.session.user || !req.session.user.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await User.findOne({ email: req.session.user.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ mobileNumber: user.mobileNumber || '' });
  } catch (error) {
    console.error('Get mobile number error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update mobile number
app.post('/api/mobile', async (req, res) => {
  if (!req.session.user || !req.session.user.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { mobileNumber } = req.body;
  if (!mobileNumber) return res.status(400).json({ error: 'Mobile number required' });

  try {
    const user = await User.findOne({ email: req.session.user.email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.mobileNumber = mobileNumber;
    await user.save();
    res.json({ message: 'Mobile number updated' });
  } catch (error) {
    console.error('Update mobile number error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark user as paid and store timestamp
app.post('/api/paid', async (req, res) => {
  if (!req.session.user || !req.session.user.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await User.findOne({ email: req.session.user.email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.paid = true;
    user.paidAt = new Date(); // ⬅ Ensure this gets saved
    await user.save();

    res.json({ message: 'Payment status updated' });
  } catch (error) {
    console.error('Update paid status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Replace with your actual EmailJS credentials
const EMAILJS_SERVICE_ID = 'service_vv5o0ng';
const EMAILJS_TEMPLATE_ID = 'template_9wbjibs';
const EMAILJS_USER_ID = 'abfC9oICRtMIGM5cb';

// Your User mongoose model


app.post('/api/request-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetCode = code;
  await user.save();

  try {
    const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_USER_ID,
        template_params: {
          to_email: email,
          message: `Your Aviator Predictor reset code is: ${code}`
        }
      }),
      timeout: 15000
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('EmailJS error:', errorText);
      return res.status(500).json({ error: 'Failed to send reset email' });
    }

    res.json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    console.error('Email sending error:', err);
    res.status(500).json({ error: 'Email service error or timeout' });
  }
});

// ✅ Verify code and reset password
app.post('/api/verify-reset', async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Email, code, and new password are required' });
  }

  const user = await User.findOne({ email, resetCode: code });
  if (!user) return res.status(400).json({ error: 'Invalid verification code' });

  user.password = newPassword; // ❗ You should hash this in production
  user.resetCode = undefined;
  await user.save();

  res.json({ message: 'Password reset successful' });
});


app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true });
  } else {
    res.json({ loggedIn: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
