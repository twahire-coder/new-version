const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');

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
  secret: 'your_secret_key', // Change to a secure key in production
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 6 * 60 * 60 * 1000 // 6 hours
  }
}));


app.use(cors({
  origin: 'http://localhost:3000', // or whatever your frontend origin is
  credentials: true
}));

// Middleware

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static HTML files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// User Schema with mobileNumber
const userSchema = new mongoose.Schema({
  username: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  isActivated: { type: Boolean, default: false },
  role: { type: String, default: 'user' },
  sessionStart: { type: Date },
  mobileNumber: { type: String, default: '' }
});

const User = mongoose.model('User', userSchema);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/country', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'country.html'));
});

app.get('/check', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'check.html'));
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    await User.create({
      username,
      email: email.toLowerCase(),
      password,
      isActivated: false,
      role: 'user',
      sessionStart: new Date(),
      mobileNumber: ''
    });

    res.status(201).json({ message: 'Signup successful' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password?.trim();

  if (!email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Hardcoded admin
  if (email === 'admin@123.com' && password === 'admin.123') {
    req.session.user = { email, username: 'Admin', role: 'admin', isActivated: true };
    return res.json(req.session.user);
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });

    // **Do NOT block login here if not activated**
    // Instead, send user info with isActivated flag
    req.session.user = {
      email: user.email,
      username: user.username,
      role: user.role,
      isActivated: user.isActivated
    };

    res.json(req.session.user);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});


// Session check endpoint
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

// Monthly Report
app.get('/api/reports/monthly', async (req, res) => {
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
// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// Prediction endpoint
app.get('/api/predict', (req, res) => {
  const base = 1.0;
  const random = parseFloat((base + Math.random() * 2).toFixed(2));
  res.json({ prediction: `${random}X` });
});

// Get all users (Admin only)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username email isActivated role');
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Toggle user activation (Admin only)
app.patch('/api/users/:id/toggle', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot modify admin user' });
    }

    user.isActivated = !user.isActivated;
    await user.save();

    res.json({ message: 'User activation status updated', user });
  } catch (error) {
    console.error('Toggle user activation error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// --- New: Get logged-in user's mobile number ---
app.get('/api/mobile', async (req, res) => {
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

// --- New: Update logged-in user's mobile number ---
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
