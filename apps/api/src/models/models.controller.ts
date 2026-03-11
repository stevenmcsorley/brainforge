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
import { ModelsService } from './models.service';
import { CreateBrainModelSchema, UpdateBrainModelSchema } from '@brainforge/contracts';

@Controller('models')
export class ModelsController {
  constructor(private modelsService: ModelsService) { }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.modelsService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.modelsService.findOne(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const data = CreateBrainModelSchema.parse(body);
    return this.modelsService.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = UpdateBrainModelSchema.parse(body);
    return this.modelsService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.modelsService.delete(id);
  }

  @Post(':id/import')
  async importData(@Param('id') id: string, @Body() body: any) {
    return this.modelsService.importData(id, body.regions ?? [], body.connections ?? []);
  }

  @Get(':id/regions')
  async getRegions(@Param('id') id: string) {
    return this.modelsService.getRegions(id);
  }

  @Get(':id/connectivity')
  async getConnectivity(@Param('id') id: string) {
    return this.modelsService.getConnectivity(id);
  }
}
