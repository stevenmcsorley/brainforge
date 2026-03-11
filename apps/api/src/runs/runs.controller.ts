import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RunsService } from './runs.service';
import { RunCommandSchema } from '@brainforge/contracts';

@Controller('runs')
export class RunsController {
  constructor(private runsService: RunsService) { }

  @Get('experiment/:experimentId')
  async findByExperiment(
    @Param('experimentId') experimentId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.runsService.findByExperiment(
      experimentId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.runsService.findOne(id);
  }

  @Post('start/:experimentId')
  async startRun(
    @Param('experimentId') experimentId: string,
    @Body() body?: { seed?: number },
  ) {
    return this.runsService.startRun(experimentId, body?.seed);
  }

  @Post(':id/command')
  async sendCommand(
    @Param('id') id: string,
    @Body() body: { command: any },
  ) {
    const command = RunCommandSchema.parse(body.command);
    return this.runsService.sendCommand(id, command);
  }

  /**
   * Worker calls this to update run status in the database.
   * PATCH /api/runs/:id/status
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; progress?: number; currentStep?: number; error?: string },
  ) {
    return this.runsService.updateRunStatus(id, body.status, {
      progress: body.progress,
      currentStep: body.currentStep,
      error: body.error,
    });
  }

  /**
   * Worker calls this to persist metric snapshots to the database.
   * POST /api/runs/:id/metrics
   */
  @Post(':id/metrics')
  @HttpCode(HttpStatus.CREATED)
  async saveMetric(
    @Param('id') id: string,
    @Body() body: { step: number; timestamp: number; metrics: Record<string, number> },
  ) {
    return this.runsService.saveRunMetric(id, body.step, body.timestamp, body.metrics);
  }

  /**
   * Worker calls this to persist run lifecycle events (completed, error).
   * POST /api/runs/:id/events
   */
  @Post(':id/events')
  @HttpCode(HttpStatus.CREATED)
  async saveEvent(
    @Param('id') id: string,
    @Body() body: { type: string; payload: Record<string, unknown> },
  ) {
    return this.runsService.saveRunEvent(id, body.type, body.payload);
  }

  @Get(':id/metrics')
  async getMetrics(
    @Param('id') id: string,
    @Query('startStep') startStep?: string,
    @Query('endStep') endStep?: string,
  ) {
    return this.runsService.getRunMetrics(
      id,
      startStep ? parseInt(startStep, 10) : undefined,
      endStep ? parseInt(endStep, 10) : undefined,
    );
  }

  @Get(':id/artifacts')
  async getArtifacts(@Param('id') id: string) {
    return this.runsService.getRunArtifacts(id);
  }

  @Post('compare')
  async compareRuns(@Body() body: { runIds: string[] }) {
    return this.runsService.compareRuns(body.runIds);
  }

  /**
   * Worker calls this after run completes to store per-region activity data.
   * PATCH /api/runs/:id/activity-map
   */
  @Patch(':id/activity-map')
  @HttpCode(HttpStatus.OK)
  async saveActivityMap(
    @Param('id') id: string,
    @Body() body: { activityMap: Record<string, unknown> },
  ) {
    return this.runsService.saveActivityMap(id, body.activityMap);
  }

  /**
   * Frontend fetches this to power the Brain Activity Map visualization.
   * GET /api/runs/:id/activity-map
   */
  @Get(':id/activity-map')
  async getActivityMap(@Param('id') id: string) {
    return this.runsService.getActivityMap(id);
  }
}
