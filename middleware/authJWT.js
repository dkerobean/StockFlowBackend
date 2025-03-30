const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User'); // **** Import the User model ****

exports.verifyToken = async (req, res, next) => { // **** Make async ****
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' }); // Use message for consistency

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // --- Fetch the full user document from DB ---
    const user = await User.findById(decoded.id)
                           .populate('locations', '_id name type'); // Populate locations if needed downstream

    if (!user) {
        return res.status(401).json({ message: 'User belonging to this token does no longer exist.' });
    }

    if (!user.active) {
         return res.status(403).json({ message: 'User account is inactive.' });
    }

    // --- Set req.user to the Mongoose document ---
    req.user = user;
    next();
  } catch (err) {
     if (err.name === 'JsonWebTokenError') {
         return res.status(401).json({ message: 'Invalid token.' });
     }
     if (err.name === 'TokenExpiredError') {
         return res.status(401).json({ message: 'Token expired.' });
     }
     // Log other unexpected errors
     console.error("JWT Verification Error:", err);
     res.status(500).json({ message: 'Failed to authenticate token.' });
  }
};

// Example: Middleware to check for Admin role
exports.isAdmin = async (req, res, next) => {
    // Now req.user is the full Mongoose document
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: "Forbidden: Requires Admin role!" });
    }
};

// Example: Middleware to check for Manager or Admin role
exports.isManagerOrAdmin = async (req, res, next) => {
    // Now req.user is the full Mongoose document
    if (req.user && (req.user.role === 'admin' || req.user.role === 'manager')) {
        next();
    } else {
        res.status(403).json({ message: "Forbidden: Requires Manager or Admin role!" });
    }
};

// Example: Middleware to check if user has access to a specific location
// Assumes locationId is available in req.params, req.query, or req.body
exports.hasLocationAccess = (locationIdParam = 'id') => { // Default param name is 'id'
  return async (req, res, next) => { // Function needs to be async if user lookup happened here, but it's now in verifyToken
    const locationId = req.params[locationIdParam] || req.query[locationIdParam] || req.body[locationIdParam];

    if (!locationId) {
      return res.status(400).json({ message: "Bad Request: Location ID missing." });
    }

     if (!mongoose.Types.ObjectId.isValid(locationId)) {
        return res.status(400).json({ message: "Invalid Location ID format." });
     }

    // Find the user from the token (verifyToken already fetched the full user document)
    // Use the User model method we added - This should now work!
    if (req.user && req.user.hasAccessToLocation(locationId)) {
      next();
    } else {
      // Log details for debugging, but send generic error to client
      console.warn(`Forbidden access attempt: User ${req.user?.id} (${req.user?.email}) attempting action on location ${locationId}`);
      res.status(403).json({ message: "Forbidden: You do not have access to this location." });
    }
  };
};

// --- Keep checkRole if you still use it anywhere ---
// But note that isAdmin and isManagerOrAdmin are more specific replacements
exports.checkRole = (roles) => (req, res, next) => {
  // Ensure req.user exists (verifyToken should handle this)
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: `Forbidden: Requires one of roles: ${roles.join(', ')}` }); // Improved message
  }
  next();
};