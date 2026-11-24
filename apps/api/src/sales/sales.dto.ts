import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsISO8601, MinLength, Matches } from 'class-validator';

export class SaleLineDto {
  @ApiPropertyOptional({ description: 'Catalog product UUID; omit for manual items' })
  @ValidateIf((line: SaleLineDto) => line.manual !== true)
  @IsUUID()
  productId?: string;
  @ApiPropertyOptional({ description: 'Set true for a one-time manual item' })
  @ValidateIf((_line, value) => value !== undefined)
  @IsBoolean()
  manual?: boolean;
  @ApiPropertyOptional({ description: 'Stable client UUID identifying the manual line' })
  @ValidateIf((line: SaleLineDto) => line.manual === true)
  @IsUUID('4')
  lineId?: string;
  @ApiPropertyOptional({ description: 'Entered name for a manual item' })
  @ValidateIf((line: SaleLineDto) => line.manual === true)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/\S/)
  productName?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10_000) qty!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(100_000_000) unitPriceCents!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(10_000) taxRateBps!: number;
}
export class PaymentDto {
  @ApiProperty({ enum: ['cash', 'card'] }) @IsIn(['cash', 'card']) method!: 'cash' | 'card';
  @ApiProperty({ description: 'Cash tendered or exact card amount, in integer cents' })
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amountCents!: number;
  @ApiPropertyOptional({ description: 'External terminal reference only. Never card details.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
export class CreateSaleDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() cashierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) occurredAt?: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') id!: string;
  @ApiProperty({ type: [SaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((item: SaleLineDto) =>
    item.manual === true ? `manual:${item.lineId}` : `product:${item.productId}`,
  )
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  items!: SaleLineDto[];
  @ApiProperty({ type: PaymentDto }) @ValidateNested() @Type(() => PaymentDto) payment!: PaymentDto;
}
export class VoidSaleDto {
  @ApiProperty() @IsString() @MinLength(4) @MaxLength(240) @Matches(/\S/) reason!: string;
  @ApiProperty({ description: 'Confirm cash return or external terminal reversal was handled' })
  @Equals(true)
  paymentReversed!: boolean;
}
