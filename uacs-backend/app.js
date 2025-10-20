require("dotenv").config();
console.log("Starting server...");
console.log("Loaded MONGODB_URI:", process.env.MONGODB_URI);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(express.json());
const allowedOrigins = [
  'http://localhost:5173',          // Local development
  'https://uacs-fe.vercel.app',     // Production frontend
  'https://uacs-be.vercel.app',     // Production backend
  process.env.FRONTEND_URL          // Any additional URLs from env
].filter(Boolean); // Remove any undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

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

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
