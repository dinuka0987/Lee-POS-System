import { BadRequestException } from '@nestjs/common';
import { calculateChange } from '@lee/shared';
import type { PaymentDto } from '../sales/sales.dto';
export function validatePayment(total: number, payment: PaymentDto) {
  if (!payment) throw new BadRequestException('Payment is required');
  if (payment.method === 'cash') {
    try {
      calculateChange(total, payment.amountCents);
    } catch {
      throw new BadRequestException('Cash received must cover the total');
    }
  } else if (!payment.reference?.trim() || payment.amountCents !== total) {
    throw new BadRequestException(
      'Card payment needs an external terminal reference and the exact total',
    );
  }
}
