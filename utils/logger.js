const { query } = require('../config/database');

/**
 * Log user activity to the database
 * @param {string} userId - UUID of the user performing the action
 * @param {string} action - Description of the action performed
 * @param {string} entityType - Type of entity affected (client, product, invoice, etc.)
 * @param {string} entityId - UUID of the affected entity
 * @param {object} details - Additional details about the action
 * @param {object} req - Express request object (optional, for IP and user agent)
 */
const logActivity = async (userId, action, entityType = null, entityId = null, details = {}, req = null) => {
  try {
    // Extract IP address and user agent from request if provided
    let ipAddress = null;
    let userAgent = null;

    if (req) {
      // Get real IP address (considering proxies)
      ipAddress = req.headers['x-forwarded-for'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress ||
                  (req.connection.socket ? req.connection.socket.remoteAddress : null);
      
      // Clean up IPv6 localhost
      if (ipAddress === '::1') {
        ipAddress = '127.0.0.1';
      }
      
      userAgent = req.headers['user-agent'];
    }

    // Prepare details object
    const logDetails = {
      ...details,
      timestamp: new Date().toISOString()
    };

    // If details came from request body/params, include relevant info
    if (req && req.method && req.originalUrl) {
      logDetails.method = req.method;
      logDetails.url = req.originalUrl;
    }

    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, entityType, entityId, JSON.stringify(logDetails), ipAddress, userAgent]
    );

    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`📝 Activity logged: ${action}`, {
        userId,
        entityType,
        entityId,
        ipAddress
      });
    }

  } catch (error) {
    console.error('❌ Failed to log activity:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

/**
 * Log system events (not tied to a specific user)
 * @param {string} action - Description of the system action
 * @param {string} entityType - Type of entity affected
 * @param {string} entityId - UUID of the affected entity
 * @param {object} details - Additional details about the action
 */
const logSystemActivity = async (action, entityType = null, entityId = null, details = {}) => {
  try {
    const logDetails = {
      ...details,
      timestamp: new Date().toISOString(),
      system: true
    };

    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES (NULL, $1, $2, $3, $4)`,
      [action, entityType, entityId, JSON.stringify(logDetails)]
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`🤖 System activity logged: ${action}`, {
        entityType,
        entityId
      });
    }

  } catch (error) {
    console.error('❌ Failed to log system activity:', error);
  }
};

/**
 * Get activity logs with filtering and pagination
 * @param {object} options - Filter and pagination options
 * @returns {object} - Paginated activity logs
 */
const getActivityLogs = async (options = {}) => {
  try {
    const {
      userId = null,
      entityType = null,
      action = null,
      startDate = null,
      endDate = null,
      page = 1,
      limit = 50,
      search = null
    } = options;

    const offset = (page - 1) * limit;
    
    let whereConditions = [];
    let queryParams = [limit, offset];
    let paramIndex = 3;

    // Build WHERE conditions
    if (userId) {
      whereConditions.push(`al.user_id = $${paramIndex}`);
      queryParams.push(userId);
      paramIndex++;
    }

    if (entityType) {
      whereConditions.push(`al.entity_type = $${paramIndex}`);
      queryParams.push(entityType);
      paramIndex++;
    }

    if (action) {
      whereConditions.push(`al.action ILIKE $${paramIndex}`);
      queryParams.push(`%${action}%`);
      paramIndex++;
    }

    if (startDate) {
      whereConditions.push(`al.created_at >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`al.created_at <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(al.action ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get logs with user information
    const logsQuery = `
      SELECT 
        al.id, al.action, al.entity_type, al.entity_id, al.details,
        al.ip_address, al.user_agent, al.created_at,
        u.username, u.full_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await query(logsQuery, queryParams);

    // Get total count
    const countParams = queryParams.slice(2); // Remove limit and offset
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
    `;
    const countResult = await query(countQuery, countParams);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      logs: result.rows.map(log => ({
        ...log,
        details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };

  } catch (error) {
    console.error('❌ Failed to get activity logs:', error);
    throw error;
  }
};

/**
 * Clean up old activity logs
 * @param {number} daysToKeep - Number of days to keep logs for
 * @returns {number} - Number of deleted logs
 */
const cleanupOldLogs = async (daysToKeep = 90) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await query(
      'DELETE FROM activity_logs WHERE created_at < $1',
      [cutoffDate]
    );

    const deletedCount = result.rowCount;
    
    await logSystemActivity('CLEANUP_OLD_LOGS', 'activity_logs', null, {
      daysToKeep,
      deletedCount,
      cutoffDate: cutoffDate.toISOString()
    });

    console.log(`🧹 Cleaned up ${deletedCount} old activity logs (older than ${daysToKeep} days)`);
    
    return deletedCount;

  } catch (error) {
    console.error('❌ Failed to cleanup old logs:', error);
    throw error;
  }
};

/**
 * Get activity statistics
 * @param {object} options - Filter options
 * @returns {object} - Activity statistics
 */
const getActivityStats = async (options = {}) => {
  try {
    const {
      startDate = null,
      endDate = null,
      userId = null
    } = options;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    if (userId) {
      whereConditions.push(`user_id = $${paramIndex}`);
      queryParams.push(userId);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get various statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_actions,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT entity_type) as entity_types,
        COUNT(DISTINCT DATE(created_at)) as active_days
      FROM activity_logs
      ${whereClause}
    `;

    const actionsByTypeQuery = `
      SELECT 
        entity_type,
        COUNT(*) as count
      FROM activity_logs
      ${whereClause}
      GROUP BY entity_type
      ORDER BY count DESC
      LIMIT 10
    `;

    const actionsByUserQuery = `
      SELECT 
        u.username,
        u.full_name,
        COUNT(*) as count
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      GROUP BY u.id, u.username, u.full_name
      ORDER BY count DESC
      LIMIT 10
    `;

    const [statsResult, typeResult, userResult] = await Promise.all([
      query(statsQuery, queryParams),
      query(actionsByTypeQuery, queryParams),
      query(actionsByUserQuery, queryParams)
    ]);

    return {
      overview: statsResult.rows[0],
      actionsByType: typeResult.rows,
      actionsByUser: userResult.rows.filter(row => row.username) // Filter out system actions
    };

  } catch (error) {
    console.error('❌ Failed to get activity stats:', error);
    throw error;
  }
};

module.exports = {
  logActivity,
  logSystemActivity,
  getActivityLogs,
  cleanupOldLogs,
  getActivityStats
};