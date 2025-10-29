require("dotenv").config();
console.log("Starting server...");
console.log("Loaded MONGODB_URI:", process.env.MONGODB_URI);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { 
  securityHeaders, 
  apiLimiter, 
  sanitizeInput,
  requestLogger 
} = require('./middleware/security');

const app = express();

// Security Middleware (apply first)
app.use(securityHeaders);
app.use(cookieParser());

// Middleware
app.use(express.json());
app.use(sanitizeInput);
// CORS configuration - Allow both production and localhost
const allowedOrigins = [
  'https://uacs-fe.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Apply rate limiting to API routes (DISABLED FOR DEVELOPMENT)
// app.use('/api/', apiLimiter);

// Request logging
app.use(requestLogger);

// Debug middleware (can be removed in production)
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log the incoming request
  console.log('Incoming Request:', {
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body,
    timestamp: new Date().toISOString()
  });

  // Add response logging
  const oldSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    console.log('Response:', {
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    return oldSend.apply(res, arguments);
  };

  next();
});

// Routes
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patients");
const inventoryRoutes = require("./routes/inventory");
const appointmentRoutes = require("./routes/appointments");
const googleAuthRoutes = require("./routes/googleAuth");
const notificationRoutes = require("./routes/notifications");
const chatRoutes = require("./routes/chat");
const certificateRoutes = require("./routes/certificates");
const feedbackRoutes = require("./routes/feedback");
const emailRoutes = require("./routes/email");

// Apply specific rate limiters (DISABLED FOR DEVELOPMENT)
const { authLimiter, appointmentLimiter } = require('./middleware/security');

// Add request logging
app.use((req, res, next) => {
  if (req.path.includes('/api/email')) {
    console.log(`🌐 Incoming request: ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
  }
  next();
});

// app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/auth/google", googleAuthRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/email", emailRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI);

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.once("open", () => {
  console.log("Connected to MongoDB");
  console.log("Database name:", mongoose.connection.name);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server if running locally (not in Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health\n`);
  });
}

// Export the Express app
module.exports = app;
