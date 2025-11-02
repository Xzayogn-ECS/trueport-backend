const express = require('express');
const passport = require('../config/passport');
const crypto = require('crypto');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router(); 

// Register - Simplified registration without role/institute
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Name, email, and password are required'
      });
    }

    // Password strength regex: 8+ chars, 1 upper, 1 lower, 1 number, 1 special
    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

    if (!strongPasswordRegex.test(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: 'User with this email already exists'
      });
    }

    // Create user
    const user = new User({
      name,
      email,
      passwordHash: password, // hashed via middleware
      role: 'STUDENT',
      profileSetupComplete: false
    });

    await user.save();

    // JWT
    const token = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: 'User with this email already exists'
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email and password are required' 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid email or password' 
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        message: 'Invalid email or password' 
      });
    }

    // Generate JWT
    const token = generateToken({ 
      userId: user._id, 
      email: user.email, 
      role: user.role 
    });

    res.json({
      message: 'Login successful',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Login failed', 
      error: error.message 
    });
  }
});

// Google Auth routes
router.get('/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google callback — set cookie AND optionally return JSON { token, user }
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    try {
      const user = req.user;
      if (!user) throw new Error('No user from passport');

      // Generate JWT token
      const token = generateToken({
        userId: user._id,
        email: user.email,
        role: user.role
      });

      // Set httpOnly cookie for cookie-based flow (keeps old behavior)
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
      });

      // Build sanitized user to send to client
      const safeUser = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        institute: user.institute || user.instituteId || null
      };

      // Detect if client expects JSON (SPA/fetch)
      const wantsJson =
        req.query.format === 'json' ||
        req.headers.accept?.includes('application/json') ||
        req.xhr ||
        req.headers['x-requested-with'] === 'XMLHttpRequest';

      if (wantsJson) {
        // Return same shape as regular /login
        return res.json({
          message: 'Login successful',
          success: true,
          token,
          user: safeUser
        });
      }

      // Otherwise default redirect flow: include token+user in fragment (not logged by servers)
      const frontend = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
      const payload = { token, user: safeUser };
      const fragment = `#auth=${encodeURIComponent(JSON.stringify(payload))}`;

      return res.redirect(`${frontend}/oauth-callback${fragment}`);
    } catch (error) {
      console.error('Google callback error:', error);
      const frontend = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
      return res.redirect(`${frontend}/auth/login?error=auth_failed`);
    }
  }
);

// Check auth status
router.get('/status', (req, res) => {
  if (req.user) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Token validation endpoint
router.post('/validate', async (req, res) => {
  console.log('=== /auth/validate called ===');
  console.log('Cookies parsed:', req.cookies);
  console.log('Cookie header:', req.headers.cookie);
  
  try {
    const { verifyToken } = require('../utils/jwt');
    
    let token = null;
    
    // 1. Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('Token from Authorization header');
    }
    
    // 2. Check parsed cookies (if cookie-parser is working)
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
      console.log('Token from parsed cookie');
    }
    
    // 3. Manually parse cookie header (fallback if cookie-parser not configured)
    if (!token && req.headers.cookie) {
      console.log('Manually parsing cookie header');
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
      
      if (cookies.auth_token) {
        token = cookies.auth_token;
        console.log('Token from manual cookie parse');
      }
    }
    
    if (!token) {
      console.log('No token found');
      return res.status(401).json({ 
        valid: false,
        message: 'No token provided' 
      });
    }

    console.log('Token found:', token.substring(0, 20) + '...');
    console.log('Verifying token...');
    
    const decoded = verifyToken(token);
    console.log('Token decoded:', decoded);
    
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user) {
      console.log('User not found');
      return res.status(401).json({ 
        valid: false,
        message: 'Invalid token - user not found' 
      });
    }

    console.log('User validated:', user.email);

    res.json({
      valid: true,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Validation error:', error.message);
    
    res.status(401).json({ 
      valid: false, 
      message: error.message 
    });
  }
});

// Magic Link: Validate token and show set-password page
// Endpoint: GET /auth/magic-link/:token
// NOTE: This endpoint only validates the token (does NOT consume it).
// The frontend should then present a "Set password" form that POSTs to
// POST /auth/magic-link/set-password with { token, password } to consume the token
router.get('/magic-link/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { redirect } = req.query; // optional redirect URL

    if (!token) {
      return res.status(400).json({
        message: 'Magic link token is required'
      });
    }

    const MagicLinkToken = require('../models/MagicLinkToken');

    // Find token but do NOT mark it used yet; this allows the frontend to show a set-password form
    const magicLink = await MagicLinkToken.findOne({ token, used: false, expiresAt: { $gt: new Date() } });

    if (!magicLink) {
      return res.status(400).json({
        message: 'Invalid or expired magic link. Please request a new one.'
      });
    }

    // Ensure user exists
    const user = await User.findOne({ email: magicLink.email }).select('-passwordHash');
    if (!user) {
      console.warn('User not found for magic link email:', magicLink.email);
      return res.status(404).json({ message: 'User account not found. Please contact the verifier.' });
    }

    // Return minimal info to the frontend so it can show an email/username and prompt for password
    res.json({
      valid: true,
      email: magicLink.email,
      user: user.toJSON(),
      redirect: redirect || `/bg-chat/${magicLink.context && magicLink.context.chatId ? magicLink.context.chatId : ''}`
    });
  } catch (error) {
    console.error('Magic link validation error:', error);
    res.status(500).json({ message: 'Failed to validate magic link', error: error.message });
  }
});

// Consume magic link and set password
// Endpoint: POST /auth/magic-link/set-password
// Body: { token, password }
router.post('/magic-link/set-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    // Basic password strength check
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!strongPasswordRegex.test(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character'
      });
    }

    const MagicLinkToken = require('../models/MagicLinkToken');

    // Verify and mark token as used (atomic)
    const magicLink = await MagicLinkToken.verifyAndUseToken(token);
    if (!magicLink) {
      return res.status(400).json({ message: 'Invalid or expired magic link. Please request a new one.' });
    }

    // Find user
    const user = await User.findOne({ email: magicLink.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found for this magic link' });
    }

    // Set password (will be hashed by pre-save hook)
    user.passwordHash = password;
    // Mark email verified since they used the magic link
    user.emailVerified = true;
    await user.save();

    // Generate JWT and set cookie so the user is logged in immediately
    const jwtToken = generateToken({ userId: user._id, email: user.email, role: user.role });
    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({ message: 'Password set successfully', token: jwtToken, user: user.toJSON(), redirect: (magicLink.context && magicLink.context.chatId) ? `/bg-chat/${magicLink.context.chatId}` : '/dashboard' });
  } catch (error) {
    console.error('Set password via magic link error:', error);
    return res.status(500).json({ message: 'Failed to set password', error: error.message });
  }
});

module.exports = router;

// Create or complete account for magic-link / placeholder users
// Protected: requires valid JWT (issued by magic link)
router.post('/create-account', requireAuth, async (req, res) => {
  try {
    const userFromToken = req.user; // populated by requireAuth middleware
    const { name, institutionName, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ message: 'Name and password are required' });
    }

    // Password strength check (reuse same policy as registration)
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!strongPasswordRegex.test(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character'
      });
    }

    // Load the full user record (include passwordHash for update)
    const user = await User.findById(userFromToken._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Ensure email consistency - do not allow changing email here
    // The frontend should not send email; use the authenticated user's email
    // Update basic profile fields and set role to VERIFIER
    user.name = name.trim();
    if (institutionName) user.institute = institutionName.trim();
    user.passwordHash = password; // will be hashed by pre-save hook
    user.role = 'VERIFIER';
    user.profileSetupComplete = true;

    // If this was an external placeholder, mark emailVerified false (or true?)
    // We'll keep emailVerified false but the account is usable.

    await user.save();

    // Issue a fresh JWT so the client can use it
    const jwtToken = generateToken({ userId: user._id, email: user.email, role: user.role });

    // Set HttpOnly cookie for convenience
    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      message: 'Account created/updated successfully',
      token: jwtToken,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Create account error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Account with this email already exists' });
    }
    return res.status(500).json({ message: 'Failed to create or update account', error: error.message });
  }
});


