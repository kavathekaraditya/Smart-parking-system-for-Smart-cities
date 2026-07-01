import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ParkingService {
  private readonly logger = new Logger(ParkingService.name);
  private aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
  ) {}

  async createLot(data: any) {
    return this.prisma.parkingLot.create({
      data: {
        name: data.name,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        basePrice: data.basePrice,
        currentPrice: data.basePrice,
        capacity: data.capacity,
        tenantId: data.tenantId || 'default-tenant',
      },
    });
  }

  async getAllLots() {
    const lots = await this.prisma.parkingLot.findMany({
      include: {
        _count: {
          select: { slots: { where: { isOccupied: false } } },
        },
      },
    });

    const enrichedLots: any[] = [];
    for (const lot of lots) {
      // Calculate current price dynamically
      const occupancyRate = lot.capacity > 0 ? lot.occupiedCount / lot.capacity : 0.0;
      const currentPrice = await this.getDynamicPrice(lot.basePrice, occupancyRate);
      
      // Update lot with current price in database (cache update)
      if (lot.currentPrice !== currentPrice) {
        await this.prisma.parkingLot.update({
          where: { id: lot.id },
          data: { currentPrice },
        });
      }

      enrichedLots.push({
        ...lot,
        currentPrice,
        availableSlots: lot._count.slots,
      });
    }

    return enrichedLots;
  }

  async getLotById(id: string) {
    const lot = await this.prisma.parkingLot.findUnique({
      where: { id },
      include: {
        slots: true,
      },
    });
    if (!lot) return null;

    const occupancyRate = lot.capacity > 0 ? lot.occupiedCount / lot.capacity : 0.0;
    const currentPrice = await this.getDynamicPrice(lot.basePrice, occupancyRate);
    
    return {
      ...lot,
      currentPrice,
      availableSlots: lot.slots.filter(s => !s.isOccupied).length,
    };
  }

  async createSlot(data: any) {
    return this.prisma.parkingSlot.create({
      data: {
        lotId: data.lotId,
        name: data.name,
        type: data.type || 'STANDARD',
        isOccupied: false,
        status: 'AVAILABLE',
      },
    });
  }

  async getSlotsByLot(lotId: string) {
    return this.prisma.parkingSlot.findMany({
      where: { lotId },
      orderBy: { name: 'asc' },
    });
  }

  private async getDynamicPrice(basePrice: number, occupancyRate: number): Promise<number> {
    try {
      // 1. Get demand score from AI service
      const hour = new Date().getHours();
      const dayOfWeek = new Date().getDay();

      const demandResponse = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/predict/demand`, {
          hour,
          day_of_week: dayOfWeek,
        })
      );
      const demandScore = demandResponse.data.demand_score || 0.5;

      // 2. Calculate pricing
      const pricingResponse = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/pricing/dynamic`, {
          base_price: basePrice,
          current_occupancy: occupancyRate,
          demand_score: demandScore,
        })
      );

      return pricingResponse.data.optimized_price || basePrice;
    } catch (error) {
      this.logger.warn(`AI Service pricing failed: ${error.message}. Using fallback pricing.`);
      // Fallback calculation: Surge price scales linearly up to +50% base price at max occupancy
      const surcharge = basePrice * occupancyRate * 0.5;
      return parseFloat((basePrice + surcharge).toFixed(2));
    }
  }

  async getAiPredictions(lotId: string) {
    const lot = await this.prisma.parkingLot.findUnique({ where: { id: lotId } });
    if (!lot) return null;

    const occupancyRate = lot.capacity > 0 ? lot.occupiedCount / lot.capacity : 0.0;
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/predict/occupancy`, {
          base_occupancy: occupancyRate,
          hour,
          day_of_week: dayOfWeek,
        })
      );
      return response.data;
    } catch (error) {
      this.logger.warn(`AI Service predictions failed: ${error.message}. Returning simulated predictions.`);
      // Return beautiful mock predictions if FastAPI is offline
      const dailyTrend = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        occupancy: parseFloat((0.2 + 0.6 * Math.sin((h - 6) * Math.PI / 12) * Math.sin((h - 6) * Math.PI / 12)).toFixed(2))
      }));
      const weeklyTrend = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({
        day,
        occupancy: parseFloat((0.4 + Math.random() * 0.3).toFixed(2))
      }));
      return {
        requested_prediction: occupancyRate,
        daily_trend: dailyTrend,
        weekly_trend: weeklyTrend,
      };
    }
  }
}
