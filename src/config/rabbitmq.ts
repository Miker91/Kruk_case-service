/**
 * RabbitMQ Configuration
 *
 * Centralized configuration for RabbitMQ connection and channels.
 * Implements connection pooling and graceful shutdown.
 */

import amqp from 'amqplib';

export interface RabbitMQConfig {
  url: string;
  exchange: string;
  deadLetterExchange: string;
}

const defaultConfig: RabbitMQConfig = {
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  exchange: 'kruk.events',
  deadLetterExchange: 'kruk.events.dlx',
};

class RabbitMQConnection {
  // Using 'any' to avoid amqplib type version mismatches (same as payment-service)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;
  private config: RabbitMQConfig;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000;

  constructor(config: RabbitMQConfig = defaultConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connection && this.channel) {
      return;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.connect();
    }

    this.isConnecting = true;

    try {
      console.log(`[RabbitMQ] Connecting to ${this.config.url}...`);
      this.connection = await amqp.connect(this.config.url);

      this.connection.on('error', (err: Error) => {
        console.error('[RabbitMQ] Connection error:', err.message);
      });

      this.connection.on('close', () => {
        console.log('[RabbitMQ] Connection closed');
        this.connection = null;
        this.channel = null;
        this.scheduleReconnect();
      });

      this.channel = await this.connection.createChannel();

      // Setup exchanges
      await this.channel.assertExchange(this.config.exchange, 'topic', {
        durable: true,
      });

      await this.channel.assertExchange(this.config.deadLetterExchange, 'topic', {
        durable: true,
      });

      this.reconnectAttempts = 0;
      console.log('[RabbitMQ] Connected successfully');
    } catch (error) {
      console.error('[RabbitMQ] Failed to connect:', error);
      this.scheduleReconnect();
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[RabbitMQ] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `[RabbitMQ] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`
    );

    setTimeout(() => {
      this.connect().catch((err) => {
        console.error('[RabbitMQ] Reconnection failed:', err.message);
      });
    }, this.reconnectDelay);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getChannel(): Promise<any> {
    if (!this.channel) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error('RabbitMQ channel not available');
    }
    return this.channel;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      console.log('[RabbitMQ] Disconnected');
    } catch (error) {
      console.error('[RabbitMQ] Error during disconnect:', error);
    }
  }

  getConfig(): RabbitMQConfig {
    return this.config;
  }
}

// Singleton instance
export const rabbitmq = new RabbitMQConnection();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[RabbitMQ] Shutting down...');
  await rabbitmq.disconnect();
});

process.on('SIGTERM', async () => {
  console.log('[RabbitMQ] Shutting down...');
  await rabbitmq.disconnect();
});
