import { Controller, Post, Get, Body, Param, Request, UseGuards } from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReservationController {
  constructor(private reservationService: ReservationService) {}

  @Post()
  async create(@Request() req: any, @Body() body: any) {
    return this.reservationService.createReservation(req.user.id, body);
  }

  @Get('me')
  async getMyReservations(@Request() req: any) {
    return this.reservationService.getUserReservations(req.user.id);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'OPERATOR')
  async getAll() {
    return this.reservationService.getAllReservations();
  }

  @Post(':id/check-in')
  async checkIn(@Param('id') id: string, @Body('qrCodeToken') qrCodeToken: string) {
    return this.reservationService.checkIn(id, qrCodeToken);
  }

  @Post(':id/check-out')
  async checkOut(@Param('id') id: string, @Body('qrCodeToken') qrCodeToken: string) {
    return this.reservationService.checkOut(id, qrCodeToken);
  }

  @Post(':id/cancel')
  async cancel(@Request() req: any, @Param('id') id: string) {
    return this.reservationService.cancelReservation(req.user.id, id);
  }
}
