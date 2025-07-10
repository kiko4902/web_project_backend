require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const helmet = require('helmet');

// 1. CORS Configuration (MUST come first)
const allowedOrigins = [
  'https://movie-frontend-alpha-six.vercel.app',
  'http://localhost:3000'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(helmet());

onst moviesRouter = require('./routes/movies'); 
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
});
