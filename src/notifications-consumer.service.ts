// Consumes mis.notifications. Per event:
//   1) INSERT notifications row (status=PENDING)
//   2) Render template (templates.ts)
//   3) SMTP send (smtp.ts)
//   4) UPDATE status=SENT (delivered_at) or FAILED
//   5) Kafka offset commit (manual — at-least-once)
//
// SMTP-only channel for now; SMS/IN_APP/WEBHOOK will plug in via the
// same dispatch in step (3).

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { v4 as uuid } from 'uuid';
import { loadConfig } from './config';
import { MongoService } from './mongo.service';
import { SmtpService } from './smtp.service';
import { TemplateRenderer } from './templates';
import type { NotificationEvent, NotificationRow } from './types';

@Injectable()
export class NotificationsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotificationsConsumer.name);
  private readonly config = loadConfig();
  private consumer?: Consumer;

  constructor(
    private readonly mongo: MongoService,
    private readonly smtp: SmtpService,
    private readonly templates: TemplateRenderer,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.kafka.brokers.length === 0) {
      this.log.warn('KAFKA_BROKERS unset — notifications consumer disabled');
      return;
    }
    const kafka = new Kafka({
      clientId: this.config.kafka.clientId,
      brokers: this.config.kafka.brokers,
    });
    this.consumer = kafka.consumer({ groupId: this.config.kafka.consumerGroup });
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: this.config.topic, fromBeginning: false });
      await this.consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
          await this.handle(message.value);
          if (this.consumer && message.offset !== undefined) {
            await this.consumer.commitOffsets([
              {
                topic,
                partition,
                offset: (BigInt(message.offset) + 1n).toString(),
              },
            ]);
          }
        },
      });
      this.log.log(
        `subscribed to ${this.config.topic} group=${this.config.kafka.consumerGroup}`,
      );
    } catch (err: any) {
      this.log.error(`consumer init failed: ${err?.message ?? err}`);
      this.consumer = undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer) await this.consumer.disconnect().catch(() => undefined);
  }

  private async handle(raw: Buffer | null): Promise<void> {
    if (!raw) return;
    let event: NotificationEvent;
    try {
      event = JSON.parse(raw.toString('utf8')) as NotificationEvent;
    } catch (err: any) {
      this.log.error(`bad notification event: ${err?.message ?? err}`);
      return;
    }

    const notificationId = `ntfn_${uuid()}`;
    const now = new Date().toISOString();
    const row: NotificationRow = {
      notification_id: notificationId,
      correlation_id: event.correlation_id,
      recipient_id: event.recipient_id,
      recipient_email: event.recipient_email,
      channel: event.channel,
      template_ref: event.template_ref,
      priority: event.priority,
      payload: JSON.stringify(event.payload),
      status: 'PENDING',
      attempts: 0,
      created_at: now,
    };
    await this.mongo.insertPending(row);

    // PoC only dispatches EMAIL. Future channels plug in here.
    if (event.channel !== 'EMAIL') {
      this.log.warn(
        `notification.skipped channel=${event.channel} not yet implemented — recorded as PENDING`,
      );
      return;
    }
    if (!event.recipient_email) {
      await this.mongo.markFailed(notificationId, 'recipient_email missing');
      this.log.error(`notification.failed id=${notificationId} reason=no-recipient-email`);
      return;
    }

    try {
      const rendered = this.templates.render(event.template_ref, event.payload);
      await this.smtp.send(event.recipient_email, rendered);
      await this.mongo.markSent(notificationId);
      this.log.log(
        `notification.sent id=${notificationId} template=${event.template_ref} ` +
          `to=${event.recipient_email} priority=${event.priority}`,
      );
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      await this.mongo.markFailed(notificationId, msg);
      this.log.error(`notification.failed id=${notificationId}: ${msg}`);
    }
  }
}
