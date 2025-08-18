const { body, param, query, validationResult } = require('express-validator');

// Generic validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
const validateUser = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_а-яА-Я]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  
  body('full_name')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Full name must be less than 255 characters'),
  
  handleValidationErrors
];

// Client validation rules
const validateClient = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Client name is required and must be less than 255 characters'),
  
  body('legal_name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Legal name is required and must be less than 255 characters'),
  
  body('mb')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('MB is required and must be less than 20 characters'),
  
  body('pib')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('PIB is required and must be less than 20 characters'),
  
  body('address')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Address is required'),
  
  body('city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be less than 100 characters'),
  
  body('municipality')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Municipality must be less than 100 characters'),
  
  body('street')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Street must be less than 255 characters'),
  
  body('house_number')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('House number must be less than 20 characters'),
  
  body('google_maps_link')
    .optional()
    .isURL()
    .withMessage('Google Maps link must be a valid URL'),
  
  body('contact_person')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Contact person must be less than 255 characters'),
  
  body('telegram')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Telegram must be less than 255 characters'),
  
  body('instagram')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Instagram must be less than 255 characters'),
  
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Phone must be less than 50 characters'),
  
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  
  body('installment_payment')
    .optional()
    .isBoolean()
    .withMessage('Installment payment must be boolean'),
  
  body('installment_term')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Installment term must be a positive integer'),
  
  body('showcase')
    .optional()
    .isBoolean()
    .withMessage('Showcase must be boolean'),
  
  body('bar')
    .optional()
    .isBoolean()
    .withMessage('Bar must be boolean'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters'),
  
  handleValidationErrors
];

// Product validation rules
const validateProduct = [
  body('code')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Product code is required and must be less than 50 characters'),
  
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Product name is required and must be less than 255 characters'),
  
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a non-negative number'),
  
  body('weight')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Weight must be a non-negative number'),
  
  body('category')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category must be less than 100 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be boolean'),
  
  handleValidationErrors
];

// UUID validation
const validateUUID = [
  param('id').isUUID().withMessage('Invalid ID format'),
  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Search term must be less than 255 characters'),
  
  handleValidationErrors
];

// Date range validation
const validateDateRange = [
  query('start_date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Start date must be a valid date'),
  
  query('end_date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('End date must be a valid date'),
  
  handleValidationErrors
];

// Invoice validation rules
const validateInvoice = [
  body('number')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Invoice number is required and must be less than 50 characters'),
  
  body('date')
    .isISO8601()
    .toDate()
    .withMessage('Valid date is required'),
  
  body('due_date')
    .isISO8601()
    .toDate()
    .withMessage('Valid due date is required'),
  
  body('client_id')
    .isUUID()
    .withMessage('Valid client ID is required'),
  
  body('delivery_address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Delivery address must be less than 500 characters'),
  
  body('vat_rate')
    .isFloat({ min: 0, max: 100 })
    .withMessage('VAT rate must be between 0 and 100'),
  
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Reference must be less than 50 characters'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  
  body('items.*.product_id')
    .isUUID()
    .withMessage('Valid product ID is required for each item'),
  
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  
  body('items.*.unit_price')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters'),
  
  handleValidationErrors
];

// Delivery validation rules
const validateDelivery = [
  body('number')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Delivery number is required and must be less than 50 characters'),
  
  body('date')
    .isISO8601()
    .toDate()
    .withMessage('Valid date is required'),
  
  body('due_date')
    .isISO8601()
    .toDate()
    .withMessage('Valid due date is required'),
  
  body('client_id')
    .isUUID()
    .withMessage('Valid client ID is required'),
  
  body('delivery_method')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Delivery method must be less than 100 characters'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  
  body('items.*.product_id')
    .isUUID()
    .withMessage('Valid product ID is required for each item'),
  
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  
  body('items.*.unit')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Unit must be less than 20 characters'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters'),
  
  handleValidationErrors
];

module.exports = {
  validateUser,
  validateClient,
  validateProduct,
  validateInvoice,
  validateDelivery,
  validateUUID,
  validatePagination,
  validateDateRange,
  handleValidationErrors
};