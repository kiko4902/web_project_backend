require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json({ limit: '10kb' }));



// Make sure you're importing router files correctly:
const moviesRouter = require('./routes/movies'); // Should export Router
app.use('/movies', moviesRouter); // This is likely line 23
app.use('/reviews', require('./routes/reviews'));
app.use('/watchlist', require('./routes/watchlist'));
app.use('/lists', require('./routes/lists'));
app.use('/search', require('./routes/search'));

const authRouter = require('./routes/auth');
app.use('/auth', authRouter); // This line must exist

app.get('/health', (req, res) => res.sendStatus(200));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
});