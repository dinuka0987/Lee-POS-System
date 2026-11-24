import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  ValidateIf,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
import { PartialType, OmitType } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(64) @Matches(/\S/) sku!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(64) @Matches(/^\S+$/) barcode!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) @Matches(/\S/) name!: string;
  @ApiProperty() @IsUUID() categoryId!: string;
  @ApiProperty({ description: 'Integer LKR cents; tax-exclusive' })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  priceCents!: number;
  @ApiProperty({ description: 'Basis points: 1800 = 18%' })
  @IsInt()
  @Min(0)
  @Max(10_000)
  taxRateBps!: number;
  @ApiPropertyOptional({ default: 0 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  initialQuantity?: number;
  @ApiPropertyOptional({ default: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['initialQuantity'] as const),
  { skipNullProperties: false },
) {}
export class CategoryDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) @Matches(/\S/) name!: string;
}

export class AdjustStockDto {
  @ApiProperty({ description: 'New stock on hand for the current branch' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;

  @ApiProperty({ description: 'Stock shown when the adjustment was opened; prevents stale edits' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  expectedQuantity!: number;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(240)
  @Matches(/\S/)
  reason!: string;
}
