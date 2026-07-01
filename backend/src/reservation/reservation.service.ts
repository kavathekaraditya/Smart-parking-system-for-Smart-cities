import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ReservationService {
  constructor(private prisma: PrismaService) {}

  async createReservation(userId: string, data: any) {
    const { lotId, slotType, vehicleId, startTime, endTime } = data;

    // Validate inputs
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
      throw new BadRequestException('Start time must be before end time.');
    }

    // 1. Check if vehicle exists and belongs to user
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle || vehicle.userId !== userId) {
      throw new BadRequestException('Invalid vehicle selection.');
    }

    // 2. Perform Dynamic Slot Allocation
    // Find an available slot in the lot of the requested type
    const lot = await this.prisma.parkingLot.findUnique({
      where: { id: lotId },
      include: { slots: true },
    });
    if (!lot) {
      throw new NotFoundException('Parking lot not found.');
    }

    // Check for standard slot availability of type
    const candidateSlots = lot.slots.filter(
      (slot) => slot.type === slotType && slot.status === 'AVAILABLE' && !slot.isOccupied
    );

    if (candidateSlots.length === 0) {
      throw new ConflictException('No slots available matching the requested type.');
    }

    // Allocate the first available slot
    const allocatedSlot = candidateSlots[0];

    // 3. Generate secure QR token for Entry/Exit
    const qrCodeToken = crypto.randomBytes(16).toString('hex');

    // 4. Create the reservation in TRANSACTION
    return this.prisma.$transaction(async (tx) => {
      // Reserve the slot in database
      await tx.parkingSlot.update({
        where: { id: allocatedSlot.id },
        data: { status: 'RESERVED' },
      });

      // Create reservation record
      const reservation = await tx.reservation.create({
        data: {
          userId,
          slotId: allocatedSlot.id,
          lotId,
          vehicleId,
          startTime: start,
          endTime: end,
          qrCodeToken,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
        },
        include: {
          slot: true,
          lot: true,
          vehicle: true,
        },
      });

      // Create initial audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'RESERVATION_CREATED',
          details: `Reserved slot ${allocatedSlot.name} at lot ${lot.name}.`,
        },
      });

      return reservation;
    });
  }

  async getUserReservations(userId: string) {
    return this.prisma.reservation.findMany({
      where: { userId },
      include: {
        slot: true,
        lot: true,
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllReservations() {
    return this.prisma.reservation.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        slot: true,
        lot: true,
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkIn(id: string, qrCodeToken: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { slot: true, lot: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found.');
    }

    if (reservation.qrCodeToken !== qrCodeToken) {
      throw new BadRequestException('Invalid QR code token.');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException(`Check-in not allowed. Reservation status is ${reservation.status}.`);
    }

    // Process entry gate inside transaction
    return this.prisma.$transaction(async (tx) => {
      // Set slot as occupied
      await tx.parkingSlot.update({
        where: { id: reservation.slotId },
        data: {
          status: 'OCCUPIED',
          isOccupied: true,
        },
      });

      // Increment occupiedCount of lot
      await tx.parkingLot.update({
        where: { id: reservation.lotId },
        data: {
          occupiedCount: { increment: 1 },
        },
      });

      // Mark reservation as active
      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          paymentStatus: 'PAID', // Assume paid or wallet charge
        },
        include: { slot: true, lot: true, vehicle: true },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          userId: reservation.userId,
          action: 'VEHICLE_CHECK_IN',
          details: `Vehicle checked in at slot ${reservation.slot.name} of lot ${reservation.lot.name}.`,
        },
      });

      return updated;
    });
  }

  async checkOut(id: string, qrCodeToken: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { slot: true, lot: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found.');
    }

    if (reservation.qrCodeToken !== qrCodeToken) {
      throw new BadRequestException('Invalid QR code token.');
    }

    if (reservation.status !== 'ACTIVE') {
      throw new BadRequestException(`Check-out not allowed. Reservation status is ${reservation.status}.`);
    }

    // Process exit gate inside transaction
    return this.prisma.$transaction(async (tx) => {
      // Free the slot
      await tx.parkingSlot.update({
        where: { id: reservation.slotId },
        data: {
          status: 'AVAILABLE',
          isOccupied: false,
        },
      });

      // Decrement occupiedCount of lot
      await tx.parkingLot.update({
        where: { id: reservation.lotId },
        data: {
          occupiedCount: { decrement: 1 },
        },
      });

      // Complete reservation
      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: 'COMPLETED',
        },
        include: { slot: true, lot: true, vehicle: true },
      });

      // Audit log exit
      await tx.auditLog.create({
        data: {
          userId: reservation.userId,
          action: 'VEHICLE_CHECK_OUT',
          details: `Vehicle checked out from slot ${reservation.slot.name} of lot ${reservation.lot.name}.`,
        },
      });

      return updated;
    });
  }

  async cancelReservation(userId: string, id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found.');
    }

    // Standard drivers can only cancel their own reservations
    if (reservation.userId !== userId) {
      throw new BadRequestException('Access denied.');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException('Only pending reservations can be cancelled.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Free the slot back to AVAILABLE
      await tx.parkingSlot.update({
        where: { id: reservation.slotId },
        data: { status: 'AVAILABLE' },
      });

      // Mark reservation cancelled
      const updated = await tx.reservation.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // Audit log cancellation
      await tx.auditLog.create({
        data: {
          userId,
          action: 'RESERVATION_CANCELLED',
          details: `Reservation ${id} was cancelled.`,
        },
      });

      return updated;
    });
  }
}
