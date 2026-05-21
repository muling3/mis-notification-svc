import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { MongoService } from './mongo.service';
import { SmtpService } from './smtp.service';
import { TemplateRenderer } from './templates';
import { NotificationsConsumer } from './notifications-consumer.service';

@Module({
  controllers: [AppController],
  providers: [MongoService, SmtpService, TemplateRenderer, NotificationsConsumer],
})
export class AppModule {}
