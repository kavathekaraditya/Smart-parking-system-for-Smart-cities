import { Controller, Post, Get, Body, Param, Request, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('charge')
  async charge(@Request() req: any, @Body() body: any) {
    return this.paymentService.chargeReservation(req.user.id, body);
  }

  @Get('invoice/:id')
  async getInvoice(@Param('id') id: string) {
    return this.paymentService.getInvoice(id);
  }

  @Get('analytics')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'CITY_AUTHORITY')
  async getAnalytics() {
    return this.paymentService.getAnalyticsSummary();
  }
}
