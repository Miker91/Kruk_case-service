/**
 * Payment Event Consumer
 *
 * Consumes payment.completed events from RabbitMQ and updates case balances.
 * Implements idempotent processing to handle duplicate events.
 *
 * KRUK-10: Integracja z Case Service - aktualizacja salda
 */

import { rabbitmq } from '../config/rabbitmq';
import { caseService } from '../services/CaseService';
import { caseEventPublisher } from './CaseEventPublisher';

// Using inline type to avoid amqplib type version issues
interface ConsumeMessage {
  content: Buffer;
  fields: any;
  properties: {
    headers?: {
      'x-death'?: Array<{ count: number }>;
    };
  };
}

export interface PaymentCompletedEvent {
  eventId: string;
  eventType: 'payment.completed';
  timestamp: string;
  version: string;
  source: string;
  correlationId: string;
  payload: {
    id: string;
    caseId: string;
    debtorId: string;
    amount: number;
    currency: string;
    status: string;
    processedAt?: string;
  };
}

export class PaymentEventConsumer {
  private readonly queueName = 'case-service.payment.completed';
  private readonly routingKey = 'payment.completed';
  private readonly processedEventIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;

  async setup(): Promise<void> {
    const channel = await rabbitmq.getChannel();
    const config = rabbitmq.getConfig();

    // Create queue with dead-letter support
    await channel.assertQueue(this.queueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': config.deadLetterExchange,
        'x-dead-letter-routing-key': 'payment.completed.failed',
      },
    });

    // Bind queue to exchange
    await channel.bindQueue(this.queueName, config.exchange, this.routingKey);

    this.channel = channel;
    console.log(`[PaymentEventConsumer] Queue ${this.queueName} bound to ${this.routingKey}`);
  }

  async startConsuming(): Promise<void> {
    if (!this.channel) {
      await this.setup();
    }

    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Prefetch 1 message at a time for ordered processing
    await this.channel.prefetch(1);

    await this.channel.consume(
      this.queueName,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        const startTime = Date.now();
        let event: PaymentCompletedEvent | null = null;

        try {
          event = JSON.parse(msg.content.toString()) as PaymentCompletedEvent;

          console.log(
            `[PaymentEventConsumer] Received payment.completed: paymentId=${event.payload.id}, caseId=${event.payload.caseId}, amount=${event.payload.amount}`
          );

          // Idempotency check
          if (this.processedEventIds.has(event.eventId)) {
            console.log(`[PaymentEventConsumer] Duplicate event ignored: ${event.eventId}`);
            this.channel!.ack(msg);
            return;
          }

          // Process the payment
          await this.handlePaymentCompleted(event);

          // Mark as processed
          this.processedEventIds.add(event.eventId);

          // Cleanup old event IDs (keep last 10000)
          if (this.processedEventIds.size > 10000) {
            const oldestIds = Array.from(this.processedEventIds).slice(0, 5000);
            oldestIds.forEach((id) => this.processedEventIds.delete(id));
          }

          // Acknowledge successful processing
          this.channel!.ack(msg);

          const processingTime = Date.now() - startTime;
          console.log(
            `[PaymentEventConsumer] Processed successfully in ${processingTime}ms: paymentId=${event.payload.id}`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(
            `[PaymentEventConsumer] Error processing message: ${errorMessage}`,
            event ? `paymentId=${event.payload.id}` : ''
          );

          // Check retry count from x-death header
          const deaths = this.getDeathCount(msg);

          if (deaths < 3) {
            // Requeue for retry
            console.log(`[PaymentEventConsumer] Requeuing message (attempt ${deaths + 1}/3)`);
            this.channel!.nack(msg, false, true);
          } else {
            // Send to dead-letter queue
            console.log(`[PaymentEventConsumer] Max retries exceeded, sending to DLQ`);
            this.channel!.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );

    console.log('[PaymentEventConsumer] Started consuming messages');
  }

  private async handlePaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
    const { payload } = event;

    // Get current case state for comparison
    const caseBefore = await caseService.getCaseById(payload.caseId);

    if (!caseBefore) {
      throw new Error(`Case not found: ${payload.caseId}`);
    }

    const previousBalance = caseBefore.currentDebt;

    // Record the payment
    const updatedCase = await caseService.recordPayment(
      payload.caseId,
      payload.id,
      payload.amount
    );

    if (!updatedCase) {
      throw new Error(`Failed to record payment for case: ${payload.caseId}`);
    }

    // Publish case.balance.updated event
    await caseEventPublisher.publishBalanceUpdated({
      caseId: payload.caseId,
      previousBalance,
      newBalance: updatedCase.currentDebt,
      paymentId: payload.id,
      paymentAmount: payload.amount,
      currency: payload.currency,
      caseStatus: updatedCase.status,
    });

    // If case was auto-closed, publish status change event
    if (caseBefore.status !== updatedCase.status) {
      await caseEventPublisher.publishStatusChanged({
        caseId: payload.caseId,
        previousStatus: caseBefore.status,
        newStatus: updatedCase.status,
        reason: updatedCase.currentDebt <= 0 ? 'Debt fully paid' : 'Status updated',
      });
    }
  }

  private getDeathCount(msg: ConsumeMessage): number {
    const xDeath = msg.properties.headers?.['x-death'];
    if (!xDeath || !Array.isArray(xDeath)) {
      return 0;
    }
    return xDeath.reduce((count, death) => count + (death.count || 0), 0);
  }

  async stop(): Promise<void> {
    if (this.channel) {
      await this.channel.cancel(this.queueName);
      console.log('[PaymentEventConsumer] Stopped consuming');
    }
  }
}

// Singleton instance
export const paymentEventConsumer = new PaymentEventConsumer();
