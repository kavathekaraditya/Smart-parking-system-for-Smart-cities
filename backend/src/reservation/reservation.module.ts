import { Module } from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { ReservationController } from './reservation.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ReservationController],
  providers: [ReservationService, PrismaService],
  exports: [ReservationService],
})
export class ReservationModule {}
