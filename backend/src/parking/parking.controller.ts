import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ParkingService } from './parking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('parking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParkingController {
  constructor(private parkingService: ParkingService) {}

  @Post('lots')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  async createLot(@Body() body: any) {
    return this.parkingService.createLot(body);
  }

  @Get('lots')
  async getAllLots() {
    return this.parkingService.getAllLots();
  }

  @Get('lots/:id')
  async getLotById(@Param('id') id: string) {
    return this.parkingService.getLotById(id);
  }

  @Get('lots/:id/predictions')
  async getPredictions(@Param('id') id: string) {
    return this.parkingService.getAiPredictions(id);
  }

  @Post('slots')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  async createSlot(@Body() body: any) {
    return this.parkingService.createSlot(body);
  }

  @Get('lots/:lotId/slots')
  async getSlotsByLot(@Param('lotId') lotId: string) {
    return this.parkingService.getSlotsByLot(lotId);
  }
}
