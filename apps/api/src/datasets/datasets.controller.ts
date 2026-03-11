import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { DatasetsService } from './datasets.service';
import { CreateDatasetSchema } from '@brainforge/contracts';

@Controller('datasets')
export class DatasetsController {
  constructor(private datasetsService: DatasetsService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.datasetsService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.datasetsService.findOne(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const data = CreateDatasetSchema.parse(body);
    return this.datasetsService.create(data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.datasetsService.delete(id);
  }
}
