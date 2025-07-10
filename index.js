require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const cors = require('cors');
const app = express();

// Enhanced CORS configuration
const allowedOrigins = [
  'https://movie-frontend-alpha-six.vercel.app',
  'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
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

//
app.use(cors(corsOptions));

app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(helmet());
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
  console.log(`Server running on port ${PORT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
});
