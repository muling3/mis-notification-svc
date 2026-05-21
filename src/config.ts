// Typed env loader. Local dev points SMTP at MailDev (mis-dev compose).

export interface NotificationConfig {
  port: number;
  mongodb: { uri?: string; db: string; collection: string };
  kafka: { brokers: string[]; clientId: string; consumerGroup: string };
  smtp: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    fromAddress: string;
    fromName: string;
  };
  topic: string;
}

export function loadConfig(): NotificationConfig {
  const brokers = (process.env.KAFKA_BROKERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const smtpUser = process.env.SMTP_USER ?? '';
  const smtpPass = process.env.SMTP_PASS ?? '';

  return {
    port: Number(process.env.PORT) || 3005,
    mongodb: {
      uri: process.env.MONGODB_URI || undefined,
      db: process.env.MONGODB_DB || 'mis_notification',
      collection: 'notifications',
    },
    kafka: {
      brokers,
      clientId: 'mis-notification-service',
      // Manual offset commit after SMTP send + Mongo write succeeds.
      consumerGroup: 'notification.notifications',
    },
    smtp: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT) || 1025,
      user: smtpUser || undefined,
      pass: smtpPass || undefined,
      fromAddress: process.env.SMTP_FROM ?? 'no-reply@mis.local',
      fromName: process.env.SMTP_FROM_NAME ?? 'MIS Notifications',
    },
    topic: 'mis.notifications',
  };
}
