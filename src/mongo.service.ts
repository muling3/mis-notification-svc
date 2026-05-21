// MongoDB client + notifications collection writer. Tolerant of an
// unreachable Mongo so the service still boots without infra.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Collection, MongoClient } from 'mongodb';
import { loadConfig } from './config';
import type { NotificationRow, NotificationStatus } from './types';

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MongoService.name);
  private readonly config = loadConfig();
  private client?: MongoClient;
  private collection?: Collection<NotificationRow>;

  async onModuleInit(): Promise<void> {
    if (!this.config.mongodb.uri) {
      this.log.warn('MONGODB_URI unset — notifications will not be persisted (PoC mode)');
      return;
    }
    try {
      this.client = new MongoClient(this.config.mongodb.uri);
      await this.client.connect();
      const db = this.client.db(this.config.mongodb.db);
      this.collection = db.collection<NotificationRow>(this.config.mongodb.collection);
      await this.collection.createIndex({ notification_id: 1 }, { unique: true });
      await this.collection.createIndex({ recipient_id: 1, created_at: -1 });
      this.log.log(
        `mongo connected — ${this.config.mongodb.db}.${this.config.mongodb.collection}`,
      );
    } catch (err: any) {
      this.log.error(`mongo connect failed: ${err?.message ?? err}`);
      this.client = undefined;
      this.collection = undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.close().catch(() => undefined);
  }

  async insertPending(row: NotificationRow): Promise<void> {
    if (!this.collection) {
      this.log.debug(`[drop] insertPending notification_id=${row.notification_id}`);
      return;
    }
    await this.collection.insertOne({ ...row });
  }

  async markSent(notificationId: string): Promise<void> {
    if (!this.collection) return;
    const now = new Date().toISOString();
    await this.collection.updateOne(
      { notification_id: notificationId },
      {
        $set: {
          status: 'SENT' as NotificationStatus,
          delivered_at: now,
          last_attempt_at: now,
        },
        $inc: { attempts: 1 },
      },
    );
  }

  async markFailed(notificationId: string, error: string): Promise<void> {
    if (!this.collection) return;
    const now = new Date().toISOString();
    await this.collection.updateOne(
      { notification_id: notificationId },
      {
        $set: {
          status: 'FAILED' as NotificationStatus,
          last_attempt_at: now,
          last_error: error.slice(0, 500),
        },
        $inc: { attempts: 1 },
      },
    );
  }

  async findByRecipient(recipientId: string, limit = 20): Promise<NotificationRow[]> {
    if (!this.collection) return [];
    return this.collection
      .find({ recipient_id: recipientId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
  }
}
