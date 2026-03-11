import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ExperimentsService } from './experiments.service';
import { CreateExperimentSchema, UpdateExperimentSchema } from '@brainforge/contracts';

@Controller('experiments')
export class ExperimentsController {
  constructor(private experimentsService: ExperimentsService) { }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.experimentsService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.experimentsService.findOne(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const data = CreateExperimentSchema.parse(body);
    return this.experimentsService.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = UpdateExperimentSchema.parse(body);
    return this.experimentsService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.experimentsService.delete(id);
  }
}
