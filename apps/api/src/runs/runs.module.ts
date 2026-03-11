import { Module } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { JobQueueService } from './job-queue.service';

@Module({
  controllers: [RunsController],
  providers: [RunsService, JobQueueService],
  exports: [RunsService],
})
export class RunsModule {}
