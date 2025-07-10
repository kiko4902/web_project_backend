require('dotenv').config();
const express = require('express');
const app = express();

// 1. Basic CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', '*');
  next();
});

// 2. Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// 3. Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
