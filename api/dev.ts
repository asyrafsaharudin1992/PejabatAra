import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// Mocking Vercel's file-based routing for local development
app.all('/api/:route', async (req, res) => {
  const { route } = req.params;
  
  // Ensure dummy environment vars are cleaned for local dev if they were copied with quotes
  if (process.env.GOOGLE_PRIVATE_KEY) {
    process.env.GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY
      .replace(/^"/, '')
      .replace(/"$/, '')
      .replace(/\\n/g, '\n');
  }

  try {
    // Dynamically import the handler file
    const module = await import(`./${route}.ts`);
    const handler = module.default;
    
    // Vercel injects query parameters from the path (e.g. /api/tasks/123)
    // Here we just handle the simple /api/route case
    await handler(req, res);
  } catch (e: any) {
    console.error(`[Dev API Error] /api/${route}:`, e.message);
    if (!res.headersSent) {
      res.status(404).json({ error: `API route /api/${route} not found or failed`, details: e.message });
    }
  }
});

async function start() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
    base: '/'
  });
  
  app.use(vite.middlewares);
  
  app.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Local Dev Server running on http://localhost:3000');
    console.log('Mapped: /api/:route -> api/:route.ts');
  });
}

start();
