import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ParkingModule } from './parking/parking.module';
import { ReservationModule } from './reservation/reservation.module';
import { PaymentModule } from './payment/payment.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [AuthModule, ParkingModule, ReservationModule, PaymentModule],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}
