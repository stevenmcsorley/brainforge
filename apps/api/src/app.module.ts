import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma.module';
import { RedisModule } from './common/redis.module';
import { ModelsModule } from './models/models.module';
import { DatasetsModule } from './datasets/datasets.module';
import { ExperimentsModule } from './experiments/experiments.module';
import { RunsModule } from './runs/runs.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ModelsModule,
    DatasetsModule,
    ExperimentsModule,
    RunsModule,
    TelemetryModule,
    AdminModule,
  ],
})
export class AppModule {}
