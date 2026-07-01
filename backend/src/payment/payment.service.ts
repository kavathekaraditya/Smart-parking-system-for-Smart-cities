import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) {}

  async chargeReservation(userId: string, data: any) {
    const { reservationId, amount, paymentMethod } = data; // stripe or razorpay

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found.');
    }

    if (reservation.paymentStatus === 'PAID') {
      throw new BadRequestException('Reservation is already paid.');
    }

    // Simulate Payment Gateway call (Stripe/Razorpay)
    const transactionId = `${paymentMethod.toUpperCase()}_TXN_${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
    const invoiceUrl = `https://smartpark-invoices.s3.amazonaws.com/INV-${transactionId}.pdf`;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Payment record
      const payment = await tx.payment.create({
        data: {
          reservationId,
          amount,
          status: 'SUCCESSFUL',
          stripePaymentId: paymentMethod === 'stripe' ? transactionId : null,
          razorpayPaymentId: paymentMethod === 'razorpay' ? transactionId : null,
          invoiceUrl,
        },
      });

      // 2. Update Reservation payment status
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          paymentStatus: 'PAID',
        },
      });

      // 3. Log Audit trail
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PAYMENT_RECEIVED',
          details: `Processed payment of $${amount} via ${paymentMethod.toUpperCase()}. Transaction: ${transactionId}`,
        },
      });

      return payment;
    });
  }

  async getInvoice(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        reservation: {
          include: {
            user: { select: { name: true, email: true } },
            slot: true,
            lot: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment invoice not found.');
    }

    return {
      invoiceId: payment.id,
      date: payment.createdAt,
      amount: payment.amount,
      status: payment.status,
      stripePaymentId: payment.stripePaymentId,
      razorpayPaymentId: payment.razorpayPaymentId,
      invoiceUrl: payment.invoiceUrl,
      driverName: payment.reservation.user.name,
      driverEmail: payment.reservation.user.email,
      parkingLot: payment.reservation.lot.name,
      slotName: payment.reservation.slot.name,
      durationHours: Math.ceil(
        (payment.reservation.endTime.getTime() - payment.reservation.startTime.getTime()) / (1000 * 60 * 60)
      ),
    };
  }

  async getAnalyticsSummary() {
    const payments = await this.prisma.payment.findMany();
    const totalRevenue = payments.reduce((sum, p) => sum + (p.status === 'SUCCESSFUL' ? p.amount : 0), 0);
    const successPayments = payments.filter(p => p.status === 'SUCCESSFUL').length;

    const auditLogsCount = await this.prisma.auditLog.count();
    const lotsCount = await this.prisma.parkingLot.count();
    const slotsCount = await this.prisma.parkingSlot.count();
    const activeReservations = await this.prisma.reservation.count({
      where: { status: 'ACTIVE' },
    });

    return {
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      successfulTransactions: successPayments,
      auditLogsCount,
      lotsCount,
      slotsCount,
      activeReservations,
    };
  }
}
