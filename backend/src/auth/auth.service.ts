import { Injectable, OnModuleInit, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.seedDatabase();
  }

  private async seedDatabase() {
    try {
      // Check if users already exist
      const userCount = await this.prisma.user.count();
      if (userCount > 0) {
        console.log('Database already has data. Skipping seed.');
        return;
      }

      console.log('Seeding initial data...');

      // 1. Seed Users
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SmartPark2026!', salt);

      const superAdmin = await this.prisma.user.create({
        data: {
          email: 'admin@smartpark.ai',
          password: hashedPassword,
          name: 'Super Admin',
          role: 'SUPER_ADMIN',
        },
      });

      const operator = await this.prisma.user.create({
        data: {
          email: 'operator@smartpark.ai',
          password: hashedPassword,
          name: 'Operator Pro',
          role: 'OPERATOR',
        },
      });

      const driver = await this.prisma.user.create({
        data: {
          email: 'driver@smartpark.ai',
          password: hashedPassword,
          name: 'John Driver',
          role: 'DRIVER',
        },
      });

      const cityAuthority = await this.prisma.user.create({
        data: {
          email: 'authority@smartpark.ai',
          password: hashedPassword,
          name: 'City Authority',
          role: 'CITY_AUTHORITY',
        },
      });

      console.log('Users seeded.');

      // 2. Seed Driver's Vehicle
      const vehicle = await this.prisma.vehicle.create({
        data: {
          plateNumber: 'KA-01-MJ-9999',
          model: 'Tesla Model S',
          color: 'Solid Black',
          userId: driver.id,
        },
      });

      console.log('Vehicles seeded.');

      // 3. Seed Parking Lots & Slots
      const lotsData = [
        {
          name: 'Downtown Smart Arena',
          address: '742 Evergreen Terrace, Downtown',
          latitude: 37.7749,
          longitude: -122.4194,
          basePrice: 5.0,
          capacity: 10,
        },
        {
          name: 'Metro Terminal Parking',
          address: '404 Airport Blvd, Northside',
          latitude: 37.6213,
          longitude: -122.3790,
          basePrice: 8.0,
          capacity: 8,
        },
        {
          name: 'Tech District Hub',
          address: '1024 Silicon Parkway, East Gate',
          latitude: 37.4275,
          longitude: -122.1697,
          basePrice: 4.0,
          capacity: 12,
        },
      ];

      for (const lotInfo of lotsData) {
        const lot = await this.prisma.parkingLot.create({
          data: {
            name: lotInfo.name,
            address: lotInfo.address,
            latitude: lotInfo.latitude,
            longitude: lotInfo.longitude,
            basePrice: lotInfo.basePrice,
            currentPrice: lotInfo.basePrice,
            capacity: lotInfo.capacity,
          },
        });

        // Create standard, EV, and Handicap slots
        for (let i = 1; i <= lotInfo.capacity; i++) {
          let type = 'STANDARD';
          if (i === 1 || i === 2) type = 'EV';
          if (i === 3) type = 'HANDICAP';

          await this.prisma.parkingSlot.create({
            data: {
              lotId: lot.id,
              name: `S-${i}`,
              type: type,
              isOccupied: false,
              status: 'AVAILABLE',
            },
          });
        }
      }

      console.log('Parking lots and slots seeded successfully.');
    } catch (error) {
      console.error('Error during database seed:', error);
    }
  }

  async register(data: any) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new BadRequestException('Email already registered.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role || 'DRIVER',
      },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: await this.jwtService.signAsync(payload),
    };
  }

  async login(data: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: await this.jwtService.signAsync(payload),
    };
  }

  async validateUser(payload: any) {
    return this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });
  }
}
