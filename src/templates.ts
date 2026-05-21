// Template renderer. PoC has the two document-upload-workflow templates
// inline; production would load from a templates/ dir and use a real
// templating engine (Handlebars / MJML for HTML).
//
// Subjects + bodies for document-rejected-malicious follow workflow §10.3.

import { Injectable, Logger } from '@nestjs/common';
import type { RenderedMessage } from './types';

type Renderer = (payload: Record<string, any>) => RenderedMessage;

@Injectable()
export class TemplateRenderer {
  private readonly log = new Logger(TemplateRenderer.name);

  private readonly registry: Record<string, Renderer> = {
    'document-rejected-malicious': (p) => ({
      subject: 'Your document submission was not accepted',
      text: [
        'Hello,',
        '',
        `The file you uploaded (document id ${p.document_id ?? 'unknown'}, submitted ${p.submitted_at ?? 'recently'}) did not pass our security checks and was not stored.`,
        '',
        `If you believe this is in error, please contact ${p.support_contact ?? 'security@mis.local'} with reference id ${p.document_id ?? 'unknown'} — do NOT re-attach the file.`,
        '',
        '— MIS Security',
      ].join('\n'),
    }),

    'document-rejected-malicious-internal': (p) => {
      const scanners = (p.scanner_results ?? [])
        .map((r: any) => {
          const ev = Array.isArray(r.evidence) ? r.evidence.join(', ') : '';
          const score = r.score !== undefined ? ` score=${r.score}` : '';
          return `  - ${r.name}: ${r.status}${score}${ev ? ` (${ev})` : ''}`;
        })
        .join('\n');
      return {
        subject: `[MIS SEV-1] Malicious document blocked — ${p.document_id ?? 'unknown'}`,
        text: [
          'A document submission was classified MALICIOUS and moved to forensics.',
          '',
          `document_id    : ${p.document_id ?? 'unknown'}`,
          `cuckoo_task_id : ${p.cuckoo_task_id ?? 'n/a'}`,
          '',
          'Scanner results:',
          scanners || '  (none)',
          '',
          'Source blob: mis-documents-forensics (legal hold).',
        ].join('\n'),
      };
    },
  };

  render(templateRef: string, payload: Record<string, any>): RenderedMessage {
    const renderer = this.registry[templateRef];
    if (!renderer) {
      this.log.warn(`unknown template_ref=${templateRef} — using generic fallback`);
      return {
        subject: `MIS notification (${templateRef})`,
        text: `Payload:\n${JSON.stringify(payload, null, 2)}`,
      };
    }
    return renderer(payload);
  }
}
