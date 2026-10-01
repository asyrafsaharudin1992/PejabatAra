import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.all('/api/:route', async (req, res) => {
  const { route } = req.params;

  if (process.env.GOOGLE_PRIVATE_KEY) {
    process.env.GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY
      .replace(/^"/, '')
      .replace(/"$/, '')
      .replace(/\\n/g, '\n');
  }

  try {
    const module = await import(`./${route}.ts`);
    await module.default(req, res);
  } catch (error: any) {
    console.error(`[Local API] /api/${route}:`, error.message);
    if (!res.headersSent) {
      res.status(404).json({ error: `API route /api/${route} not found`, details: error.message });
    }
  }
});

app.listen(3001, '127.0.0.1', () => {
  console.log('Local API ready at http://127.0.0.1:3001');
});
