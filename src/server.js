const app = require('./index');

const { port } = app.config;

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
