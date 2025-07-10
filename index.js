require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

// 1. CORS Configuration - MUST come first
const allowedOrigins = [
  'https://movie-frontend-alpha-six.vercel.app',
  'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// 2. Handle preflight requests globally
app.options('*', cors(corsOptions));

// 3. Security middleware
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// 4. Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/auth', authLimiter);

// 5. Routes
app.use('/movies', require('./routes/movies'));
app.use('/reviews', require('./routes/reviews'));
app.use('/watchlist', require('./routes/watchlist'));
app.use('/search', require('./routes/search'));
app.use('/users', require('./routes/users'));
app.use('/auth', require('./routes/auth')); 
app.use('/genres', require('./routes/genres'));

// 6. Health check
app.get('/health', (req, res) => res.sendStatus(200));

// 7. Error handling
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy blocked this request' });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 8. Server startup
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
});
