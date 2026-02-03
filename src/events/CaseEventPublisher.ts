/**
 * Case Event Publisher
 *
 * Publishes case-related events to RabbitMQ.
 * Events: case.balance.updated, case.status.changed
 *
 * KRUK-10: Integracja z Case Service - aktualizacja salda
 */

import { v4 as uuidv4 } from 'uuid';
import { rabbitmq } from '../config/rabbitmq';
import { CaseStatus } from '../models/Case';

export interface CaseBalanceUpdatedEvent {
  eventId: string;
  eventType: 'case.balance.updated';
  timestamp: string;
  version: string;
  source: string;
  correlationId: string;
  payload: {
    caseId: string;
    previousBalance: number;
    newBalance: number;
    paymentId: string;
    paymentAmount: number;
    currency: string;
    caseStatus: CaseStatus;
  };
}

export interface CaseStatusChangedEvent {
  eventId: string;
  eventType: 'case.status.changed';
  timestamp: string;
  version: string;
  source: string;
  correlationId: string;
  payload: {
    caseId: string;
    previousStatus: CaseStatus;
    newStatus: CaseStatus;
    reason: string;
  };
}

export interface BalanceUpdatePayload {
  caseId: string;
  previousBalance: number;
  newBalance: number;
  paymentId: string;
  paymentAmount: number;
  currency: string;
  caseStatus: CaseStatus;
}

export interface StatusChangePayload {
  caseId: string;
  previousStatus: CaseStatus;
  newStatus: CaseStatus;
  reason: string;
}

export class CaseEventPublisher {
  private readonly source = 'case-service';
  private readonly version = '1.0';

  async publishBalanceUpdated(payload: BalanceUpdatePayload): Promise<void> {
    const event: CaseBalanceUpdatedEvent = {
      eventId: uuidv4(),
      eventType: 'case.balance.updated',
      timestamp: new Date().toISOString(),
      version: this.version,
      source: this.source,
      correlationId: payload.paymentId,
      payload,
    };

    await this.publish('case.balance.updated', event);

    console.log(
      `[CaseEventPublisher] Published case.balance.updated: caseId=${payload.caseId}, ` +
        `${payload.previousBalance} -> ${payload.newBalance}`
    );
  }

  async publishStatusChanged(payload: StatusChangePayload): Promise<void> {
    const event: CaseStatusChangedEvent = {
      eventId: uuidv4(),
      eventType: 'case.status.changed',
      timestamp: new Date().toISOString(),
      version: this.version,
      source: this.source,
      correlationId: payload.caseId,
      payload,
    };

    await this.publish('case.status.changed', event);

    console.log(
      `[CaseEventPublisher] Published case.status.changed: caseId=${payload.caseId}, ` +
        `${payload.previousStatus} -> ${payload.newStatus}`
    );
  }

  private async publish(routingKey: string, event: object): Promise<void> {
    try {
      const channel = await rabbitmq.getChannel();
      const config = rabbitmq.getConfig();

      const message = Buffer.from(JSON.stringify(event));

      channel.publish(config.exchange, routingKey, message, {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`[CaseEventPublisher] Failed to publish ${routingKey}:`, error);
      // Don't throw - we don't want to fail the main operation if event publishing fails
      // The balance update has already happened, event is just for notification
    }
  }
}

// Singleton instance
export const caseEventPublisher = new CaseEventPublisher();
