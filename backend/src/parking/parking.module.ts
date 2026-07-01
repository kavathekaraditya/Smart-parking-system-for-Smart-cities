import { Module } from '@nestjs/common';
import { ParkingService } from './parking.service';
import { ParkingController } from './parking.controller';
import { PrismaService } from '../prisma.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [ParkingController],
  providers: [ParkingService, PrismaService],
  exports: [ParkingService],
})
export class ParkingModule {}
