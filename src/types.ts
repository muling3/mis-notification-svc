// Shapes mirror schema.dbml's mongo.notifications and the
// mis.notifications.v1 event envelope emitted by document-svc.

export type Channel = 'EMAIL' | 'SMS' | 'IN_APP' | 'WEBHOOK';
export type NotificationStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'DELIVERED'
  | 'READ';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface NotificationEvent {
  schema: 'mis.notifications.v1';
  correlation_id?: string;
  channel: Channel;
  template_ref: string;
  recipient_id: string;
  recipient_email?: string;
  payload: Record<string, unknown>;
  priority: Priority;
}

// Persisted row — mirrors schema.dbml mongo.notifications fields.
export interface NotificationRow {
  notification_id: string;
  correlation_id?: string;
  recipient_id: string;
  recipient_email?: string;
  channel: Channel;
  template_ref: string;
  priority: Priority;
  payload: string; // JSON-encoded; arbitrary shape per template
  status: NotificationStatus;
  attempts: number;
  last_attempt_at?: string;
  last_error?: string;
  created_at: string;
  delivered_at?: string;
}

export interface RenderedMessage {
  subject: string;
  text: string;
  html?: string;
}
