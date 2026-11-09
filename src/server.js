import express from 'express';
import requests from './routes/requests.js';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.use('/api/v1/transcript-requests', requests);

app.use((req, res) =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } })
);

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
  console.error(err);
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));