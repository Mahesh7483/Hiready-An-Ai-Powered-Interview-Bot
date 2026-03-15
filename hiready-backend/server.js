// 1️⃣ Import packages
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// 2️⃣ Create app
const app = express();

// 3️⃣ Middleware
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:8080"], // React frontend
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

// 4️⃣ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// 5️⃣ Basic test route
app.get('/api/test', (req, res) => {
  res.json({ message: "Backend is working 🚀" });
});

// 6️⃣ Import Routes
const questionRoutes = require('./routes/questionRoutes');
const authRoutes = require('./routes/authRoutes');
const interviewRoutes = require('./routes/interviewRoutes');

// 7️⃣ Use Routes
app.use('/api/questions', questionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/interview', interviewRoutes);

// 8️⃣ Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});