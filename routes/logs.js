const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getActivityLogs, getActivityStats, cleanupOldLogs } = require('../utils/logger');
const { validatePagination, validateDateRange } = require('../middleware/validation');

const router = express.Router();

// Get activity logs with filtering and pagination
router.get('/', authenticateToken, validatePagination, validateDateRange, async (req, res) => {
  try {
    const {
      user_id,
      entity_type,
      action,
      start_date,
      end_date,
      page = 1,
      limit = 50,
      search
    } = req.query;

    // Non-admin users can only see their own logs
    const userId = req.user.role === 'admin' ? user_id : req.user.id;

    const options = {
      userId,
      entityType: entity_type,
      action,
      startDate: start_date,
      endDate: end_date,
      page: parseInt(page),
      limit: parseInt(limit),
      search
    };

    const result = await getActivityLogs(options);

    res.json(result);

  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Get activity statistics (admin only)
router.get('/stats', authenticateToken, requireAdmin, validateDateRange, async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      user_id
    } = req.query;

    const options = {
      startDate: start_date,
      endDate: end_date,
      userId: user_id
    };

    const stats = await getActivityStats(options);

    res.json(stats);

  } catch (error) {
    console.error('Get activity stats error:', error);
    res.status(500).json({ error: 'Failed to fetch activity statistics' });
  }
});

// Get unique entity types for filtering
router.get('/entity-types', authenticateToken, async (req, res) => {
  try {
    const { query } = require('../config/database');
    
    const result = await query(
      `SELECT DISTINCT entity_type 
       FROM activity_logs 
       WHERE entity_type IS NOT NULL 
       ORDER BY entity_type ASC`
    );

    const entityTypes = result.rows.map(row => row.entity_type);

    res.json({ entityTypes });

  } catch (error) {
    console.error('Get entity types error:', error);
    res.status(500).json({ error: 'Failed to fetch entity types' });
  }
});

// Get users for filtering (admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { query } = require('../config/database');
    
    const result = await query(
      `SELECT DISTINCT u.id, u.username, u.full_name
       FROM activity_logs al
       JOIN users u ON al.user_id = u.id
       ORDER BY u.username ASC`
    );

    res.json({ users: result.rows });

  } catch (error) {
    console.error('Get log users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Clean up old logs (admin only)
router.delete('/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const daysToKeep = parseInt(days);

    if (daysToKeep < 1 || daysToKeep > 365) {
      return res.status(400).json({ 
        error: 'Days must be between 1 and 365' 
      });
    }

    const deletedCount = await cleanupOldLogs(daysToKeep);

    res.json({
      message: 'Old logs cleaned up successfully',
      deletedCount,
      daysKept: daysToKeep
    });

  } catch (error) {
    console.error('Cleanup logs error:', error);
    res.status(500).json({ error: 'Failed to cleanup old logs' });
  }
});

// Export logs to CSV/Excel format
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const {
      format = 'csv',
      user_id,
      entity_type,
      action,
      start_date,
      end_date,
      search
    } = req.query;

    // Non-admin users can only export their own logs
    const userId = req.user.role === 'admin' ? user_id : req.user.id;

    // Get all logs without pagination for export
    const options = {
      userId,
      entityType: entity_type,
      action,
      startDate: start_date,
      endDate: end_date,
      page: 1,
      limit: 10000, // Large limit for export
      search
    };

    const result = await getActivityLogs(options);

    if (format === 'json') {
      res.json(result.logs);
      return;
    }

    // Generate CSV
    const csvHeaders = [
      'Date',
      'User',
      'Action',
      'Entity Type',
      'Entity ID',
      'IP Address',
      'Details'
    ].join(',');

    const csvRows = result.logs.map(log => [
      new Date(log.created_at).toISOString(),
      log.username || 'System',
      `"${log.action}"`,
      log.entity_type || '',
      log.entity_id || '',
      log.ip_address || '',
      `"${JSON.stringify(log.details || {})}"`
    ].join(','));

    const csvContent = [csvHeaders, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="activity_logs_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export logs error:', error);
    res.status(500).json({ error: 'Failed to export activity logs' });
  }
});

module.exports = router;