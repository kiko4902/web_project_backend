require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const app = express();

// 1. Apply CORS FIRST before other middleware
const allowedOrigins = [
  https://movie-frontend-alpha-six.vercel.app,
  http://localhost:3000
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// 2. Explicitly handle OPTIONS for all routes
app.options('*', cors());

// 3. Then add other middleware
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// 4. Add debug middleware
app.use((req, res, next) => {
  console.log(`Incoming ${req.method} request from origin:`, req.headers.origin);
  next();
});


const moviesRouter = require('./routes/movies'); 
app.use('/movies', moviesRouter); 
app.use('/reviews', require('./routes/reviews'));
app.use('/watchlist', require('./routes/watchlist'));
app.use('/search', require('./routes/search'));
const usersRouter = require('./routes/users');
app.use('/users', usersRouter); 
const authRouter = require('./routes/auth');
app.use('/auth', authRouter); 
const genresRouter = require('./routes/genres');
app.use('/genres', genresRouter); 
app.get('/health', (req, res) => res.sendStatus(200));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running with CORS for:`, allowedOrigins);
});
