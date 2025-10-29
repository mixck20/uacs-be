require("dotenv").config();

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
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export the Express app
module.exports = app;
