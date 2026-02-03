import express from 'express';
import cors from 'cors';
import routes from './routes';
import { rabbitmq } from './config/rabbitmq';
import { paymentEventConsumer } from './events';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'case-service',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api', routes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

app.listen(PORT, async () => {
  console.log(`🏢 Case Service running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}/api/cases`);

  // Initialize RabbitMQ connection and start consuming events
  try {
    await rabbitmq.connect();
    await paymentEventConsumer.setup();
    await paymentEventConsumer.startConsuming();
    console.log(`   Events: Listening for payment.completed`);
  } catch (error) {
    console.warn('   Events: RabbitMQ not available, running in REST-only mode');
    console.warn('           Set RABBITMQ_URL to enable event processing');
  }
});

export default app;
