const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateUser } = require('../middleware/validation');
const { logActivity } = require('../utils/logger');

const router = express.Router();

// Register new user
router.post('/register', validateUser, async (req, res) => {
  try {
    const { username, password, email, full_name } = req.body;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await query(
      `INSERT INTO users (username, password_hash, email, full_name) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, full_name, role, created_at`,
      [username, password_hash, email, full_name]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Log activity
    await logActivity(user.id, 'User registered', 'user', user.id, req);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user
    const result = await query(
      'SELECT id, username, password_hash, email, full_name, role, is_active, permissions FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Log activity
    await logActivity(user.id, 'User logged in', 'user', user.id, req);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        permissions: user.permissions || {}
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        full_name: req.user.full_name,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { email, full_name } = req.body;
    const userId = req.user.id;

    const result = await query(
      `UPDATE users 
       SET email = COALESCE($1, email), full_name = COALESCE($2, full_name)
       WHERE id = $3 
       RETURNING id, username, email, full_name, role`,
      [email, full_name, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Log activity
    await logActivity(userId, 'Profile updated', 'user', userId, req);

    res.json({
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const new_password_hash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [new_password_hash, userId]
    );

    // Log activity
    await logActivity(userId, 'Password changed', 'user', userId, req);

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Logout (client-side token removal, but we log the activity)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Log activity
    await logActivity(req.user.id, 'User logged out', 'user', req.user.id, req);
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Admin only: Get all users
router.get('/users', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const result = await query(
      'SELECT id, username, email, full_name, role, is_active, permissions, created_at FROM users ORDER BY created_at DESC'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin only: Create new user
router.post('/users', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const { username, password, email, full_name, role = 'user', permissions = {} } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1 OR ($2 IS NOT NULL AND email = $2)',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await query(
      `INSERT INTO users (username, password_hash, email, full_name, role, permissions) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, username, email, full_name, role, permissions, created_at`,
      [username, password_hash, email, full_name, role, JSON.stringify(permissions)]
    );

    const newUser = result.rows[0];

    // Log activity
    await logActivity(req.user.id, 'User created', 'user', newUser.id, {
      created_username: username,
      role: role
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
        permissions: newUser.permissions,
        created_at: newUser.created_at
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Admin only: Update user permissions
router.put('/users/:id/permissions', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'Valid permissions object is required' });
    }

    const result = await query(
      'UPDATE users SET permissions = $1 WHERE id = $2 RETURNING id, username, permissions',
      [JSON.stringify(permissions), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];

    // Log activity
    await logActivity(req.user.id, 'User permissions updated', 'user', id, {
      target_username: updatedUser.username,
      new_permissions: permissions
    });

    res.json({
      message: 'User permissions updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Admin only: Delete user
router.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get user info before deletion
    const userInfo = await query('SELECT username FROM users WHERE id = $1', [id]);
    if (userInfo.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    await query('DELETE FROM users WHERE id = $1', [id]);

    // Log activity
    await logActivity(req.user.id, 'User deleted', 'user', id, {
      deleted_username: userInfo.rows[0].username
    });

    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Admin only: Toggle user active status
router.put('/users/:id/toggle-status', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;

    // Prevent admin from deactivating themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const result = await query(
      'UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, username, is_active',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];

    // Log activity
    await logActivity(req.user.id, `User ${updatedUser.is_active ? 'activated' : 'deactivated'}`, 'user', id, {
      target_username: updatedUser.username,
      new_status: updatedUser.is_active
    });

    res.json({
      message: `User ${updatedUser.is_active ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});

module.exports = router;

