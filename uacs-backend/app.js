require("dotenv").config();
console.log("Starting server...");
console.log("Loaded MONGODB_URI:", process.env.MONGODB_URI);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(express.json());
// CORS configuration
const corsOptions = {
  origin: 'https://uacs-fe.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Debug middleware
app.use((req, res, next) => {
  console.log('Request:', {
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body
  });
  next();
});

// Routes
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patients");
const inventoryRoutes = require("./routes/inventory");
const appointmentRoutes = require("./routes/appointments");

app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/appointments", appointmentRoutes);

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

// Export the Express app
module.exports = app;
