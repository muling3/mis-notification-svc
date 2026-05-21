// Nodemailer wrapper. Local dev points at MailDev (mis-dev compose).
// In prod, host/port/user/pass come from Vault path
// `secret/notification/smtp` per workflow doc §10.2.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { loadConfig } from './config';
import type { RenderedMessage } from './types';

@Injectable()
export class SmtpService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SmtpService.name);
  private readonly config = loadConfig();
  private transporter?: nodemailer.Transporter;

  async onModuleInit(): Promise<void> {
    this.transporter = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      // MailDev runs unauthenticated; only set auth when both are present.
      auth:
        this.config.smtp.user && this.config.smtp.pass
          ? { user: this.config.smtp.user, pass: this.config.smtp.pass }
          : undefined,
      // MailDev doesn't support STARTTLS — disable upgrade attempts so a
      // failed STARTTLS doesn't kill the send.
      ignoreTLS: true,
    });
    try {
      await this.transporter.verify();
      this.log.log(`smtp ready — host=${this.config.smtp.host}:${this.config.smtp.port}`);
    } catch (err: any) {
      this.log.warn(`smtp verify failed: ${err?.message ?? err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter?.close();
  }

  async send(to: string, message: RenderedMessage): Promise<void> {
    if (!this.transporter) throw new Error('smtp: transporter not initialised');
    const info = await this.transporter.sendMail({
      from: `"${this.config.smtp.fromName}" <${this.config.smtp.fromAddress}>`,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.log.debug(`smtp.sent messageId=${info.messageId} to=${to}`);
  }
}
